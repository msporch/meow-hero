// Rastreamento da distância percorrida no mundo real.
// Três fontes: GPS (padrão, ao ar livre), pedômetro por acelerômetro (indoor/esteira)
// e um simulador para testar no desktop.
import {
  GPS_MAX_ACCURACY, GPS_MIN_DELTA, GPS_MAX_SPEED, GPS_TIMEOUT_MS, DEFAULT_STRIDE,
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

    // Fix ruim demais: mantém o status, mas não integra distância.
    if (pos.coords.accuracy > GPS_MAX_ACCURACY) {
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

    // Jitter: não move o ponto de referência, para que caminhadas lentas somem depois.
    if (d < GPS_MIN_DELTA) {
      this._decaySpeed(now);
      return;
    }
    // Salto impossível: fix ruim, descarta e recomeça a referência.
    if (d / dt > GPS_MAX_SPEED) {
      this._lastFix = fix;
      return;
    }

    this.distanceM += d;
    this.rawSpeedMs = d / dt;
    this.speedMs += (this.rawSpeedMs - this.speedMs) * 0.35;
    this._lastFix = fix;
    this.lastAcceptedAt = now;
    this.status = 'ok';
    this.message = '';
    this.onUpdate?.(this);
  }

  _decaySpeed(now) {
    // Sem deslocamento novo: a velocidade cai suavemente até zero (o herói para).
    const idle = (now - this.lastAcceptedAt) / 1000;
    if (idle > 1.5) this.speedMs *= 0.9;
  }

  // ---------- Pedômetro ----------

  async _startSteps() {
    const DME = window.DeviceMotionEvent;
    if (!DME) {
      this.status = 'error';
      this.message = 'Sem acelerometro';
      return false;
    }
    if (typeof DME.requestPermission === 'function') {
      try {
        const r = await DME.requestPermission();
        if (r !== 'granted') { this.status = 'denied'; this.message = 'Permissao negada'; return false; }
      } catch {
        this.status = 'denied'; this.message = 'Permissao negada'; return false;
      }
    }

    this._onMotion = ev => this._onAccel(ev);
    window.addEventListener('devicemotion', this._onMotion, { passive: true });
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
        this.distanceM += this.stride;

        if (gap < MAX_GAP) {
          this._stepIntervals.push(gap);
          if (this._stepIntervals.length > 8) this._stepIntervals.shift();
          const avg = this._stepIntervals.reduce((s, v) => s + v, 0) / this._stepIntervals.length;
          this.rawSpeedMs = this.stride / (avg / 1000);
          this.speedMs += (this.rawSpeedMs - this.speedMs) * 0.3;
        }
        this.lastAcceptedAt = now;
        this.onUpdate?.(this);
      }
      this._peakState = 'high';
    } else if (this._peakState === 'high' && ac < LO) {
      this._peakState = 'low';
    }

    if (now - this._lastStepAt > MAX_GAP) this.speedMs *= 0.94;
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
      const d = this._demoSpeed * dt + extra;
      this.distanceM += d;
      this.rawSpeedMs = d / dt;
      this.speedMs += (this.rawSpeedMs - this.speedMs) * 0.2;
      this.lastAcceptedAt = now;
      return;
    }

    if (this.mode === 'gps') {
      this._decaySpeed(now);
      if (this.status === 'ok' && now - this.lastFixAt > GPS_TIMEOUT_MS) {
        this.status = 'stale';
        this.message = 'Sinal perdido';
      }
    }
    if (this.mode === 'steps') {
      if (now - this._lastStepAt > 1800) this.speedMs *= 0.9;
    }
    if (this.speedMs < 0.05) this.speedMs = 0;
  }

  // ---------- Derivados ----------

  /** Ritmo atual em min/km (Infinity quando parado). */
  get paceMinKm() {
    if (this.speedMs < 0.35) return Infinity;
    return (1000 / this.speedMs) / 60;
  }

  /** Ritmo médio desde o início, em min/km. */
  paceAvg(elapsedS) {
    if (this.distanceM < 20 || elapsedS <= 0) return Infinity;
    return (elapsedS / 60) / (this.distanceM / 1000);
  }

  get isMoving() { return this.speedMs > 0.45; }
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
