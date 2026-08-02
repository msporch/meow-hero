// Rastreamento da distância percorrida no mundo real.
// Três fontes: GPS (padrão, ao ar livre), pedômetro por acelerômetro (indoor/esteira)
// e um simulador para testar no desktop.
import {
  GPS_MAX_ACCURACY, GPS_MIN_DELTA, GPS_MAX_SPEED, GPS_TIMEOUT_MS, DEFAULT_STRIDE,
  SPEED_WINDOW_MS, STOP_WINDOW_MS, SPEED_SAMPLE_MS, MOVE_ON_SPEED, MOVE_MIN_SPEED,
  STOP_CONFIRM_MS, STEP_RECENT_MS, SPEED_DECAY_TAU,
} from './config.js';

const R_EARTH = 6371000;

/** Distância em metros entre dois pontos lat/lon. */
export function haversine(a, b) {
  const φ1 = a.lat * Math.PI / 180, φ2 = b.lat * Math.PI / 180;
  const dφ = φ2 - φ1;
  const dλ = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

export class Tracker {
  constructor() {
    this.mode = 'gps';           // 'gps' | 'steps' | 'demo'
    this.status = 'idle';        // 'idle' | 'waiting' | 'ok' | 'denied' | 'error' | 'stale'
    this.message = '';

    this.distanceM = 0;
    this.speedMs = 0;            // suavizada
    this.rawSpeedMs = 0;
    this.accuracy = null;
    this.steps = 0;
    this.stride = DEFAULT_STRIDE;

    this.running = false;
    this.startedAt = 0;
    this.lastFixAt = 0;
    this.lastAcceptedAt = 0;

    // Estado de movimento (ver config.js). `moving` tem histerese: liga na
    // hora e só desliga após STOP_CONFIRM_MS realmente parado.
    this.moving = false;
    this._lastMoveAt = 0;
    this._window = [];          // amostras {t, dist} da janela deslizante
    this._lastSampleAt = 0;
    this._cadenceSpeed = 0;     // velocidade estimada pela cadência de passos

    // Diagnóstico, exibido na tela de depuração
    this.fixesRecebidos = 0;
    this.fixesAceitos = 0;
    this.fixesImprecisos = 0;
    this.fixesJitter = 0;
    this.fixesAbsurdos = 0;
    this.motionOk = false;

    this._watchId = null;
    this._lastFix = null;
    this._onMotion = null;

    // Estado do detector de passos
    this._grav = 9.81;
    this._peakState = 'low';
    // -Infinity para o primeiro passo nunca cair no período refratário.
    this._lastStepAt = -Infinity;
    this._stepIntervals = [];

    // Simulador
    this._demoSpeed = 3.0;       // m/s (~5:33 min/km)
    this._demoBoost = 0;

    this.onUpdate = null;        // callback opcional
  }

  // ---------- ciclo de vida ----------

  async start(mode = 'gps') {
    this.mode = mode;
    this.running = true;
    this.startedAt = performance.now();
    this.lastFixAt = performance.now();
    this.status = 'waiting';
    this.message = '';

    // O acelerômetro sobe em TODOS os modos. No modo GPS ele não conta
    // distância: serve como detector de movimento, que responde na hora e não
    // depende do satélite. É o que permite o herói começar a correr assim que
    // o usuário anda, sem esperar o próximo fix.
    this._startMotion();

    if (mode === 'gps') return this._startGps();
    if (mode === 'steps') return this._startSteps();
    this.status = 'ok';
    this.message = 'Simulador';
    return true;
  }

  stop() {
    this.running = false;
    if (this._watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
    if (this._onMotion) {
      window.removeEventListener('devicemotion', this._onMotion);
      this._onMotion = null;
    }
  }

  reset() {
    this.stop();
    this.distanceM = 0;
    this.speedMs = 0;
    this.rawSpeedMs = 0;
    this.steps = 0;
    this._lastFix = null;
    this._stepIntervals = [];
    this._window = [];
    this._lastSampleAt = 0;
    this._cadenceSpeed = 0;
    this._lastStepAt = -Infinity;
    this._lastMoveAt = 0;
    this.moving = false;
    this.fixesRecebidos = this.fixesAceitos = 0;
    this.fixesImprecisos = this.fixesJitter = this.fixesAbsurdos = 0;
    this.status = 'idle';
  }

  // ---------- GPS ----------

  async _startGps() {
    if (!('geolocation' in navigator)) {
      this.status = 'error';
      this.message = 'Sem GPS neste aparelho';
      return false;
    }
    if (!window.isSecureContext) {
      this.status = 'error';
      this.message = 'Precisa de HTTPS';
      return false;
    }

    this._watchId = navigator.geolocation.watchPosition(
      p => this._onFix(p),
      e => {
        if (e.code === 1) { this.status = 'denied'; this.message = 'Permissao negada'; }
        else { this.status = 'error'; this.message = 'GPS indisponivel'; }
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
    return true;
  }

  _onFix(pos) {
    if (!this.running) return;
    const now = performance.now();
    this.lastFixAt = now;
    this.accuracy = pos.coords.accuracy;
    this.fixesRecebidos++;

    // Fix ruim demais: mantém o status, mas não integra distância.
    if (pos.coords.accuracy > GPS_MAX_ACCURACY) {
      this.fixesImprecisos++;
      if (this.status !== 'ok') { this.status = 'waiting'; this.message = 'Buscando sinal'; }
      return;
    }

    const fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: pos.timestamp || Date.now() };

    if (!this._lastFix) {
      this._lastFix = fix;
      this.status = 'ok';
      this.message = '';
      this.lastAcceptedAt = now;
      return;
    }

    const d = haversine(this._lastFix, fix);
    const dt = Math.max(0.001, (fix.t - this._lastFix.t) / 1000);

    // Jitter: NÃO move o ponto de referência, para que caminhadas lentas somem
    // ao longo de vários fixes em vez de se perderem. Caminhando a 1,3 m/s com
    // fix a cada segundo, cada passo isolado cai aqui — dois já passam.
    if (d < GPS_MIN_DELTA) {
      this.fixesJitter++;
      return;
    }
    // Salto impossível: fix ruim, descarta e recomeça a referência.
    if (d / dt > GPS_MAX_SPEED) {
      this.fixesAbsurdos++;
      this._lastFix = fix;
      return;
    }

    this.distanceM += d;
    this.rawSpeedMs = d / dt;
    this._lastFix = fix;
    this.lastAcceptedAt = now;
    this.fixesAceitos++;
    this.status = 'ok';
    this.message = '';
    this.onUpdate?.(this);
  }

  /**
   * Velocidade medida sobre a janela deslizante de deslocamento.
   *
   * Antes a velocidade saía de um fix contra o outro e decaía a cada frame — o
   * que a zerava em ~1 s e fazia o herói parar mesmo com o usuário andando.
   * Aqui ela vem do quanto a distância cresceu ao longo de vários segundos, o
   * que é estável mesmo com fixes irregulares ou descartados.
   */
  get windowSpeed() {
    if (this._window.length < 2) return 0;
    const a = this._window[0];
    const b = this._window[this._window.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt < 0.6) return 0;
    return Math.max(0, (b.dist - a.dist) / dt);
  }

  /**
   * Velocidade usada para animar o herói e rolar o cenário.
   *
   * Enquanto o estado for "em movimento" ela nunca zera: o mundo continua
   * andando entre um fix e outro, sem depender de o satélite responder. Só cai
   * a zero quando o movimento é dado como encerrado (ver _updateMovement).
   */
  get displaySpeedMs() {
    if (!this.moving) return 0;
    // A distância verdadeira vem do GPS, então a exibição segue a janela.
    // A cadência é só reserva, para quando a janela ainda não tem dados (início
    // da corrida, ou sinal ausente) — usar o máximo das duas fazia o cenário
    // correr adiantado sempre que o balanço do bolso inflava a contagem.
    const base = this.windowSpeed > 0.2 ? this.windowSpeed : this._cadenceSpeed;
    return Math.max(base, MOVE_MIN_SPEED);
  }

  /**
   * Velocidade nos últimos ~2,5 s.
   *
   * A janela cheia de 5 s é boa para estimar o ritmo, mas lenta para perceber
   * que o usuário parou: levava quase 8 s até o herói parar. Esta janela curta
   * decide só a transição para "parado".
   */
  get recentSpeed() {
    const w = this._window;
    if (w.length < 2) return 0;
    const b = w[w.length - 1];
    const corte = b.t - STOP_WINDOW_MS;
    let a = w[0];
    for (let i = w.length - 1; i >= 0; i--) {
      a = w[i];
      if (w[i].t <= corte) break;
    }
    const dt = (b.t - a.t) / 1000;
    if (dt < 0.6) return this.windowSpeed;
    return Math.max(0, (b.dist - a.dist) / dt);
  }

  /** Amostra a janela em intervalos fixos, independente da chegada de fixes. */
  _sampleWindow(now) {
    if (now - this._lastSampleAt < SPEED_SAMPLE_MS) return;
    this._lastSampleAt = now;
    this._window.push({ t: now, dist: this.distanceM });
    while (this._window.length > 2 && now - this._window[0].t > SPEED_WINDOW_MS) {
      this._window.shift();
    }
  }

  /**
   * Estado de movimento, com histerese e duas fontes independentes.
   *
   * Liga assim que QUALQUER sinal indica deslocamento — o acelerômetro reage em
   * menos de um passo, sem esperar o GPS. Só desliga depois de STOP_CONFIRM_MS
   * com os dois sinais em silêncio, para que uma falha momentânea de sinal não
   * pare o herói no meio da corrida.
   */
  _updateMovement(now, dt) {
    // Para entrar em movimento basta a janela cheia acusar deslocamento; para
    // sair, usa a janela curta, que percebe a parada bem mais rápido.
    const porGps = (this.moving ? this.recentSpeed : this.windowSpeed) > MOVE_ON_SPEED;
    const porPassos = (now - this._lastStepAt) < STEP_RECENT_MS;

    if (porGps || porPassos) {
      this._lastMoveAt = now;
      this.moving = true;
    } else if (this.moving && now - this._lastMoveAt > STOP_CONFIRM_MS) {
      this.moving = false;
    }

    // Velocidade honesta, usada no ritmo do HUD.
    const alvo = this.moving ? Math.max(this.windowSpeed, this._cadenceSpeed) : 0;
    if (alvo > this.speedMs) this.speedMs = alvo;
    else this.speedMs += (alvo - this.speedMs) * (1 - Math.exp(-dt / SPEED_DECAY_TAU));
    if (this.speedMs < 0.05) this.speedMs = 0;
  }

  // ---------- Pedômetro / detector de movimento ----------

  /**
   * Liga o acelerômetro. Roda em qualquer modo: mesmo no GPS ele é o detector
   * de movimento que responde na hora. No Android não precisa de permissão em
   * contexto seguro; no iOS precisa, e se for negada o jogo segue só com GPS.
   */
  async _startMotion() {
    const DME = window.DeviceMotionEvent;
    if (!DME || this._onMotion) return false;

    if (typeof DME.requestPermission === 'function') {
      try {
        if (await DME.requestPermission() !== 'granted') return false;
      } catch { return false; }
    }

    this._onMotion = ev => this._onAccel(ev);
    window.addEventListener('devicemotion', this._onMotion, { passive: true });
    this.motionOk = true;
    return true;
  }

  async _startSteps() {
    const ok = await this._startMotion();
    if (!ok && !this.motionOk) {
      this.status = 'error';
      this.message = 'Sem acelerometro';
      return false;
    }
    this.status = 'ok';
    this.message = 'Contando passos';
    return true;
  }

  _onAccel(ev) {
    if (!this.running) return;
    const a = ev.accelerationIncludingGravity;
    if (!a || a.x == null) return;

    const mag = Math.hypot(a.x, a.y, a.z);
    this._grav += (mag - this._grav) * 0.08;      // passa-baixa = componente da gravidade
    const ac = mag - this._grav;                   // aceleração dinâmica

    const now = performance.now();
    const HI = 1.35, LO = -0.6, MIN_GAP = 250, MAX_GAP = 2000;

    if (this._peakState === 'low' && ac > HI) {
      if (now - this._lastStepAt > MIN_GAP) {
        const gap = now - this._lastStepAt;
        this._lastStepAt = now;
        this.steps++;

        // Só o modo PASSOS usa o acelerômetro como fonte de distância. No modo
        // GPS ele apenas informa que há movimento — a distância vem do satélite.
        if (this.mode === 'steps') this.distanceM += this.stride;

        if (gap < MAX_GAP) {
          this._stepIntervals.push(gap);
          if (this._stepIntervals.length > 8) this._stepIntervals.shift();
          const avg = this._stepIntervals.reduce((s, v) => s + v, 0) / this._stepIntervals.length;
          this._cadenceSpeed = this.stride / (avg / 1000);
        }
        this.lastAcceptedAt = now;
        this.onUpdate?.(this);
      }
      this._peakState = 'high';
    } else if (this._peakState === 'high' && ac < LO) {
      this._peakState = 'low';
    }

    if (now - this._lastStepAt > MAX_GAP) this._cadenceSpeed = 0;
  }

  // ---------- Simulador ----------

  demoNudge(meters = 50) { this._demoBoost += meters; }
  setDemoSpeed(v) { this._demoSpeed = v; }

  /** Chamado a cada frame pelo jogo. dt em segundos. */
  tick(dt) {
    if (!this.running) return;
    const now = performance.now();

    if (this.mode === 'demo') {
      const extra = Math.min(this._demoBoost, this._demoSpeed * 6 * dt);
      this._demoBoost -= extra;
      this.distanceM += this._demoSpeed * dt + extra;
      this._lastStepAt = now;              // o simulador está sempre "andando"
    }

    if (this.mode === 'gps' && this.status === 'ok' && now - this.lastFixAt > GPS_TIMEOUT_MS) {
      this.status = 'stale';
      this.message = 'Sinal perdido';
    }

    // A janela e o estado de movimento valem para todos os modos.
    this._sampleWindow(now);
    this._updateMovement(now, dt);
  }

  // ---------- Derivados ----------

  /** Ritmo atual em min/km (Infinity quando parado). */
  get paceMinKm() {
    if (!this.moving || this.speedMs < 0.35) return Infinity;
    return (1000 / this.speedMs) / 60;
  }

  /** Ritmo médio desde o início, em min/km. */
  paceAvg(elapsedS) {
    if (this.distanceM < 20 || elapsedS <= 0) return Infinity;
    return (elapsedS / 60) / (this.distanceM / 1000);
  }

  /** Estado de movimento com histerese — não oscila entre um fix e outro. */
  get isMoving() { return this.moving; }
}

export function formatPace(minKm) {
  if (!isFinite(minKm) || minKm > 99) return '--:--';
  const m = Math.floor(minKm);
  const s = Math.round((minKm - m) * 60);
  const mm = s === 60 ? m + 1 : m;
  const ss = s === 60 ? 0 : s;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function formatTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
