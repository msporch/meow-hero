// Cliente do multijogador.
//
// Envia posição para o servidor a cada poucos segundos e recebe de volta os
// jogadores próximos — apenas distância em metros e diferença de progresso.
// Coordenada de ninguém chega a outro jogador.
//
// O endereço do servidor entra pela URL (?mp=https://...) e fica guardado,
// porque digitar URL na tela do jogo seria cruel.
import { MP_INTERVAL_MS, MP_TIMEOUT_MS, MP_STALE_MS } from './config.js';
import * as store from './storage.js';

/** Identificador anônimo e estável deste aparelho. Não é ligado a você. */
export function deviceId() {
  let id = store.get('mpId');
  if (!id) {
    const bytes = new Uint8Array(12);
    (globalThis.crypto ?? {}).getRandomValues?.(bytes);
    id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    if (id.length < 16) id = `id${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    store.set('mpId', id);
  }
  return id;
}

/** Lê ?mp=... da URL, guarda e limpa a barra de endereço. */
export function captureServerFromUrl() {
  try {
    const p = new URLSearchParams(location.search);
    const mp = p.get('mp');
    if (!mp) return store.get('mpServer') || '';

    const url = new URL(mp);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return store.get('mpServer') || '';

    const limpo = url.origin;
    store.set('mpServer', limpo);
    p.delete('mp');
    const rest = p.toString();
    history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''));
    return limpo;
  } catch {
    return store.get('mpServer') || '';
  }
}

export class Multiplayer {
  constructor() {
    this.server = store.get('mpServer') || '';
    this.enabled = false;
    this.players = [];          // [{id, distM, aheadM}]
    this.status = 'off';        // 'off' | 'sem-servidor' | 'conectando' | 'ok' | 'erro'
    this.lastOkAt = 0;
    this.envios = 0;
    this.erros = 0;
    this._busy = false;
    this._nextAt = 0;
  }

  get configured() { return !!this.server; }

  start() {
    if (!this.server) { this.status = 'sem-servidor'; return false; }
    this.enabled = true;
    this.status = 'conectando';
    this._nextAt = 0;
    return true;
  }

  stop() {
    this.enabled = false;
    this.status = 'off';
    this.players = [];
  }

  /**
   * Chamado a cada frame. Só envia a cada MP_INTERVAL_MS e nunca em paralelo:
   * durante a corrida a conexão pode estar ruim, e requisições empilhadas
   * gastariam bateria sem trazer nada.
   */
  tick(now, { position, runM, goalKm }) {
    if (!this.enabled || this._busy || !position) return;
    if (now < this._nextAt) return;

    this._nextAt = now + MP_INTERVAL_MS;
    this._send(position, runM, goalKm);

    // Sem resposta há muito tempo: esvazia a cena em vez de mostrar fantasmas
    // de gente que já foi embora.
    if (this.lastOkAt && now - this.lastOkAt > MP_STALE_MS) {
      this.players = [];
      this.status = 'erro';
    }
  }

  async _send(position, runM, goalKm) {
    this._busy = true;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), MP_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.server}/api/presence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: deviceId(),
          lat: position.lat,
          lon: position.lon,
          runM: Math.round(runM),
          goalKm,
        }),
        signal: ctrl.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.players = Array.isArray(data.players) ? data.players : [];
      this.status = 'ok';
      this.lastOkAt = performance.now();
      this.envios++;
    } catch {
      this.erros++;
      if (this.status !== 'ok') this.status = 'erro';
    } finally {
      clearTimeout(timer);
      this._busy = false;
    }
  }
}
