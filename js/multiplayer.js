// Cliente do multijogador.
//
// Envia posição para o servidor a cada poucos segundos e recebe de volta os
// jogadores próximos — apenas distância em metros e diferença de progresso.
// Coordenada de ninguém chega a outro jogador.
//
// O endereço do servidor entra pela URL (?mp=https://...) e fica guardado,
// porque digitar URL na tela do jogo seria cruel.
import {
  MP_INTERVAL_MS, MP_TIMEOUT_MS, MP_STALE_MS,
  MP_VISIBLE_M, MP_MIN_OFFSET, MP_SPAN_PX, MP_GLIDE, MP_EXIT_PX, W, HERO_X,
} from './config.js';
import * as store from './storage.js';

/**
 * Estado de APRESENTAÇÃO dos rivais, separado do que o servidor manda.
 *
 * O servidor responde a cada 4 s; sem isto o rival teleportaria a cada
 * resposta. E como o mapeamento de distância era saturado num teto, quem
 * estava longe ficava colado num ponto fixo da lateral para sempre — aqui o
 * deslocamento passa da borda de propósito, então quem se afasta sai de quadro
 * sozinho. Quem some do servidor recebe um alvo fora da tela e sai correndo,
 * em vez de desaparecer no ar.
 */
export class RivalSet {
  constructor() {
    this.rivals = new Map();   // id → {x, alvo, distM, aheadM, saindo}
  }

  /** Converte distância física em deslocamento na tela (pode passar da borda). */
  static offsetFor(distM) {
    return MP_MIN_OFFSET + (distM / MP_VISIBLE_M) * MP_SPAN_PX;
  }

  /** Recebe a lista do servidor e atualiza os alvos. */
  sync(players) {
    const vistos = new Set();

    for (const p of players) {
      vistos.add(p.id);
      const lado = p.aheadM >= 0 ? 1 : -1;
      const alvo = HERO_X + lado * RivalSet.offsetFor(p.distM);

      const r = this.rivals.get(p.id);
      if (r) {
        r.alvo = alvo; r.distM = p.distM; r.aheadM = p.aheadM;
        r.nome = p.nome || r.nome; r.saindo = false;
      } else {
        // Entra já pela borda do lado certo, correndo para o lugar dele.
        this.rivals.set(p.id, {
          id: p.id, nome: p.nome || '', x: HERO_X + lado * (W + 20), alvo,
          distM: p.distM, aheadM: p.aheadM, saindo: false,
        });
      }
    }

    // Quem não veio na resposta saiu do servidor: manda para fora de quadro.
    for (const [id, r] of this.rivals) {
      if (vistos.has(id)) continue;
      if (!r.saindo) {
        r.saindo = true;
        r.alvo = r.x + Math.sign(r.x - HERO_X || 1) * MP_EXIT_PX;
      }
    }
  }

  /** Desliza cada rival para o alvo e descarta quem já saiu da tela. */
  tick(dt) {
    const k = 1 - Math.exp(-MP_GLIDE * dt);
    for (const [id, r] of this.rivals) {
      r.x += (r.alvo - r.x) * k;
      const foraDeQuadro = r.x < -30 || r.x > W + 30;
      if (foraDeQuadro && (r.saindo || r.distM > MP_VISIBLE_M)) this.rivals.delete(id);
    }
  }

  /** Só quem está dentro da tela, dos mais próximos para os mais distantes. */
  visible(max) {
    const out = [];
    for (const r of this.rivals.values()) {
      if (r.x < -10 || r.x > W + 10) continue;
      out.push(r);
    }
    out.sort((a, b) => a.distM - b.distM);
    return max ? out.slice(0, max) : out;
  }

  clear() { this.rivals.clear(); }
}

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
    this.players = [];          // [{id, nome, distM, aheadM}] — cru, como veio
    this.rivals = new RivalSet();
    this.name = store.get('nome') || '';
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
    this.rivals.clear();
  }

  /**
   * Chamado a cada frame. Só envia a cada MP_INTERVAL_MS e nunca em paralelo:
   * durante a corrida a conexão pode estar ruim, e requisições empilhadas
   * gastariam bateria sem trazer nada.
   */
  tick(now, dt, { position, runM, goalKm }) {
    // O deslize roda todo frame, independente do envio: é ele que faz o rival
    // andar entre uma resposta e outra, e sair de quadro quando some.
    this.rivals.tick(dt);

    if (!this.enabled) return;

    // Sem resposta há muito tempo: manda todos embora em vez de deixar na tela
    // gente que já foi.
    if (this.lastOkAt && now - this.lastOkAt > MP_STALE_MS && this.players.length) {
      this.players = [];
      this.rivals.sync([]);
      this.status = 'erro';
    }

    if (this._busy || !position || now < this._nextAt) return;
    this._nextAt = now + MP_INTERVAL_MS;
    this._send(position, runM, goalKm);
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
          nome: this.name,
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
      this.rivals.sync(this.players);
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
