// Rastreamento do movimento real.
//
// Quem move o herói é o ACELERÔMETRO: o passo é detectado em milissegundos,
// funciona sem sinal e não espera satélite. O GPS não move nada — ele só mede
// a distância real (para calibrar a passada e fechar o relatório) e fornece a
// posição usada pelo modo multijogador.
import {
  GPS_MAX_ACCURACY, GPS_MIN_DELTA, GPS_MAX_SPEED, GPS_TIMEOUT_MS, DEFAULT_STRIDE,
  STEP_RECENT_MS, STOP_CONFIRM_MS, CADENCE_SAMPLES, MOVE_MIN_SPEED, MOVE_MAX_SPEED,
  STEP_PEAK, STEP_VALLEY, STEP_MIN_GAP_MS, STEP_MAX_GAP_MS,
  CALIB_MIN_M, CALIB_MIN_STEPS, CALIB_GAIN, STRIDE_MIN, STRIDE_MAX, DIST_CORRECT_GAIN,
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

/** Modos oferecidos na tela de preparo. */
export const MODES = [
  { id: 'steps+gps', label: 'PASSOS+GPS', hint: 'Passos movem o heroi. GPS mede a distancia real.' },
  { id: 'steps',     label: 'SO PASSOS',  hint: 'Esteira ou sem sinal. Nao liga o GPS.' },
  { id: 'demo',      label: 'DEMO',       hint: 'Simulador, para testar sem correr.' },
];

export class Tracker {
  constructor() {
    this.mode = 'steps+gps';
    this.status = 'idle';        // 'idle' | 'waiting' | 'ok' | 'denied' | 'error' | 'stale'
    this.message = '';

    /** Distância do JOGO: passos × passada. É ela que avança o percurso. */
    this.distanceM = 0;
    /** Distância medida pelo GPS. Usada no relatório e para calibrar a passada. */
    this.gpsDistanceM = 0;

    this.steps = 0;
    this.stride = DEFAULT_STRIDE;
    this.strideCalibrated = false;
    this.moving = false;

    this.accuracy = null;
    this.position = null;        // {lat, lon} do último fix bom (multijogador)

    this.running = false;
    this.startedAt = 0;
    this.lastFixAt = 0;

    this._watchId = null;
    this._onMotion = null;
    this._lastFix = null;

    // Detector de passos
    this._grav = 9.81;
    this._peakState = 'low';
    this._lastStepAt = -Infinity;
    this._stepGaps = [];
    this._cadenceSpeed = 0;

    // Calibração
    this._calibGpsStart = 0;
    this._calibStepStart = 0;

    // Simulador
    this._demoSpeed = 3.0;
    this._demoBoost = 0;
    this._demoStepAcc = 0;

    // Diagnóstico
    this.motionOk = false;
    this.fixesRecebidos = 0;
    this.fixesAceitos = 0;
    this.fixesImprecisos = 0;
    this.fixesJitter = 0;
    this.fixesAbsurdos = 0;
    this.calibracoes = 0;

    this.onUpdate = null;
  }

  // ---------- ciclo de vida ----------

  async start(mode = 'steps+gps') {
    this.mode = mode;
    this.running = true;
    this.startedAt = performance.now();
    this.lastFixAt = performance.now();
    this.status = 'waiting';
    this.message = '';

    if (mode === 'demo') {
      this.status = 'ok';
      this.message = 'Simulador';
      return true;
    }

    const temSensor = await this._startMotion();
    if (!temSensor) {
      this.status = 'error';
      this.message = 'Sem sensor de movimento';
    } else {
      this.status = 'ok';
      this.message = '';
    }

    // O GPS é opcional: sem ele o jogo roda igual, só perde a distância
    // aferida, a média final e o multijogador.
    if (mode === 'steps+gps') this._startGps();

    return temSensor;
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
    this.gpsDistanceM = 0;
    this.steps = 0;
    this.moving = false;
    this._lastFix = null;
    this._lastStepAt = -Infinity;
    this._stepGaps = [];
    this._cadenceSpeed = 0;
    this._calibGpsStart = 0;
    this._calibStepStart = 0;
    this._demoStepAcc = 0;
    this.position = null;
    this.accuracy = null;
    this.strideCalibrated = false;
    this.fixesRecebidos = this.fixesAceitos = 0;
    this.fixesImprecisos = this.fixesJitter = this.fixesAbsurdos = 0;
    this.calibracoes = 0;
    this.status = 'idle';
  }

  // ---------- acelerômetro (movimento) ----------

  /**
   * Liga o acelerômetro. No Android não pede permissão em contexto seguro;
   * no iOS pede, e a chamada precisa vir de um gesto do usuário.
   */
  async _startMotion() {
    const DME = window.DeviceMotionEvent;
    if (!DME) return false;
    if (this._onMotion) return true;

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

  _onAccel(ev) {
    if (!this.running) return;
    const a = ev.accelerationIncludingGravity;
    if (!a || a.x == null) return;

    // Passa-baixa isola a gravidade; o resto é a aceleração do movimento.
    const mag = Math.hypot(a.x, a.y, a.z);
    this._grav += (mag - this._grav) * 0.08;
    this._registerAccel(mag - this._grav, performance.now());
  }

  /** Máquina de pico/vale do detector de passos. Separada para poder testar. */
  _registerAccel(ac, now) {
    if (this._peakState === 'low' && ac > STEP_PEAK) {
      if (now - this._lastStepAt > STEP_MIN_GAP_MS) {
        const gap = now - this._lastStepAt;
        this._lastStepAt = now;
        this.step(gap);
      }
      this._peakState = 'high';
    } else if (this._peakState === 'high' && ac < STEP_VALLEY) {
      this._peakState = 'low';
    }
  }

  /** Contabiliza um passo: avança a distância do jogo e atualiza a cadência. */
  step(gap = Infinity) {
    this.steps++;
    this.distanceM += this.stride;

    if (gap < STEP_MAX_GAP_MS) {
      this._stepGaps.push(gap);
      if (this._stepGaps.length > CADENCE_SAMPLES) this._stepGaps.shift();
      const media = this._stepGaps.reduce((s, v) => s + v, 0) / this._stepGaps.length;
      const v = this.stride / (media / 1000);
      this._cadenceSpeed = Math.min(MOVE_MAX_SPEED, v);
    }
    this.onUpdate?.(this);
  }

  // ---------- GPS (medição, não movimento) ----------

  _startGps() {
    if (!('geolocation' in navigator) || !window.isSecureContext) return false;

    this._watchId = navigator.geolocation.watchPosition(
      p => this._onFix(p),
      () => { /* sem GPS o jogo continua: ele não move o herói */ },
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

    if (pos.coords.accuracy > GPS_MAX_ACCURACY) { this.fixesImprecisos++; return; }

    const fix = { lat: pos.coords.latitude, lon: pos.coords.longitude, t: pos.timestamp || Date.now() };
    this.position = { lat: fix.lat, lon: fix.lon };

    if (!this._lastFix) { this._lastFix = fix; return; }

    const d = haversine(this._lastFix, fix);
    const dt = Math.max(0.001, (fix.t - this._lastFix.t) / 1000);

    // Jitter: não move a referência, para o deslocamento somar ao longo de
    // vários fixes em vez de se perder.
    if (d < GPS_MIN_DELTA) { this.fixesJitter++; return; }
    if (d / dt > GPS_MAX_SPEED) { this.fixesAbsurdos++; this._lastFix = fix; return; }

    this.gpsDistanceM += d;
    this._lastFix = fix;
    this.fixesAceitos++;
    this._calibrateStride();
  }

  /**
   * Ajusta a passada comparando metros do GPS com passos dados no mesmo trecho.
   *
   * Sem isso a distância do jogo herda o erro da passada padrão — e é ela que
   * decide quando a meta foi cumprida. Só ajusta com trecho e amostra grandes o
   * bastante, e rejeita resultados fora do que é uma passada humana.
   */
  _calibrateStride() {
    const dGps = this.gpsDistanceM - this._calibGpsStart;
    const dSteps = this.steps - this._calibStepStart;
    if (dGps < CALIB_MIN_M || dSteps < CALIB_MIN_STEPS) return;

    const medida = dGps / dSteps;
    if (medida >= STRIDE_MIN && medida <= STRIDE_MAX) {
      this.stride += (medida - this.stride) * CALIB_GAIN;
      this.strideCalibrated = true;
      this.calibracoes++;

      // Puxa também o total acumulado: os passos dados antes desta medição
      // entraram com a passada errada. Sem isso o jogo fecha a meta de 6 km
      // com 5,3 km percorridos de verdade.
      this.distanceM += (this.gpsDistanceM - this.distanceM) * DIST_CORRECT_GAIN;
    }
    this._calibGpsStart = this.gpsDistanceM;
    this._calibStepStart = this.steps;
  }

  // ---------- simulador ----------

  demoNudge(meters = 50) { this._demoBoost += meters; }
  setDemoSpeed(v) { this._demoSpeed = v; }

  // ---------- loop ----------

  /** Chamado a cada frame pelo jogo. dt em segundos. */
  tick(dt) {
    if (!this.running) return;
    const now = performance.now();

    if (this.mode === 'demo') {
      // Gera passos de verdade, para o simulador exercitar o mesmo caminho.
      const extra = Math.min(this._demoBoost, this._demoSpeed * 6 * dt);
      this._demoBoost -= extra;
      this._demoStepAcc += (this._demoSpeed * dt + extra) / this.stride;
      while (this._demoStepAcc >= 1) {
        this._demoStepAcc -= 1;
        const gap = (this.stride / this._demoSpeed) * 1000;
        this._lastStepAt = now;
        this.step(gap);
      }
      this.gpsDistanceM = this.distanceM;
    }

    if (this.mode === 'steps+gps' && this.status === 'ok' && now - this.lastFixAt > GPS_TIMEOUT_MS) {
      this.status = 'stale';
      this.message = 'Sem sinal de GPS';
    }

    // Estado de movimento: liga no primeiro passo, desliga após o silêncio.
    const desdeUltimoPasso = now - this._lastStepAt;
    if (desdeUltimoPasso < STEP_RECENT_MS) {
      this.moving = true;
    } else if (this.moving && desdeUltimoPasso > STOP_CONFIRM_MS) {
      this.moving = false;
      this._stepGaps = [];
      this._cadenceSpeed = 0;
    }
  }

  // ---------- derivados ----------

  /**
   * Velocidade usada para animar o herói e rolar o cenário.
   * Vem da cadência dos passos — instantânea e independente de sinal.
   */
  get displaySpeedMs() {
    if (!this.moving) return 0;
    return Math.max(this._cadenceSpeed, MOVE_MIN_SPEED);
  }

  get cadenceSpeed() { return this._cadenceSpeed; }

  /** Passos por minuto. */
  get cadenceSpm() {
    if (!this.moving || !this._stepGaps.length) return 0;
    const media = this._stepGaps.reduce((s, v) => s + v, 0) / this._stepGaps.length;
    return Math.round(60000 / media);
  }

  /** Distância a reportar: a do GPS quando houver, senão a dos passos. */
  get reportedDistanceM() {
    return this.gpsDistanceM > 0 ? this.gpsDistanceM : this.distanceM;
  }

  /** Velocidade média da corrida inteira, em km/h. */
  avgSpeedKmh(elapsedS) {
    if (elapsedS <= 0) return 0;
    return (this.reportedDistanceM / elapsedS) * 3.6;
  }

  get isMoving() { return this.moving; }
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

/** Velocidade em km/h com uma casa, para o relatório final. */
export function formatKmh(kmh) {
  if (!isFinite(kmh) || kmh <= 0) return '--';
  return kmh.toFixed(1);
}
