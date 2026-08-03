// Lógica de presença do multijogador — sem nada específico de Node ou
// Cloudflare, para o mesmo arquivo rodar nos dois lugares.
//
// Privacidade: o servidor RECEBE coordenadas (precisa, para saber quem está
// perto) mas nunca as DEVOLVE. Cada jogador só descobre a distância em metros
// até os outros e quanto eles estão à frente na corrida.

const R_EARTH = 6371000;

export function haversine(a, b) {
  const φ1 = a.lat * Math.PI / 180, φ2 = b.lat * Math.PI / 180;
  const dφ = φ2 - φ1;
  const dλ = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const DEFAULTS = {
  radiusM: 1500,     // até onde um jogador é considerado "próximo"
  ttlMs: 45000,      // sem atualizar por tanto tempo, sai da lista
  maxPlayers: 12,    // teto de vizinhos devolvidos
};

/**
 * Limpa o nome do jogador, que é escolhido por ele e mostrado aos outros.
 *
 * Acentos são dobrados na letra base em vez de removidos — senão "JOSÉ" viraria
 * "JOS". Depois sobra só o que a fonte 5x7 do jogo sabe desenhar.
 */
export function limpaNome(bruto) {
  return String(bruto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // é → e
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8)
    .trim();
}

/** Validação defensiva: a entrada vem da rede. */
export function sanitize(body) {
  if (!body || typeof body !== 'object') return null;
  const id = String(body.id ?? '').slice(0, 64);
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const runM = Number(body.runM);
  const goalKm = Number(body.goalKm);

  if (!id || !/^[\w-]{8,64}$/.test(id)) return null;
  if (!isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!isFinite(lon) || lon < -180 || lon > 180) return null;
  if (!isFinite(runM) || runM < 0 || runM > 500000) return null;

  return {
    id, lat, lon,
    nome: limpaNome(body.nome),
    runM: Math.round(runM),
    goalKm: isFinite(goalKm) && goalKm > 0 && goalKm <= 200 ? goalKm : null,
  };
}

export class Presence {
  constructor(opts = {}) {
    this.cfg = { ...DEFAULTS, ...opts };
    this.players = new Map();   // id → {lat, lon, runM, goalKm, t}
  }

  /** Registra/atualiza um jogador e devolve os vizinhos dele. */
  update(entry, now = Date.now()) {
    this.players.set(entry.id, { ...entry, t: now });
    this.sweep(now);
    return this.nearby(entry.id, now);
  }

  /** Remove quem parou de atualizar. */
  sweep(now = Date.now()) {
    for (const [id, p] of this.players) {
      if (now - p.t > this.cfg.ttlMs) this.players.delete(id);
    }
  }

  /**
   * Vizinhos de um jogador.
   * Devolve só distância física e diferença de progresso — nunca coordenadas.
   */
  nearby(id, now = Date.now()) {
    const eu = this.players.get(id);
    if (!eu) return [];

    const out = [];
    for (const [outroId, p] of this.players) {
      if (outroId === id) continue;
      if (now - p.t > this.cfg.ttlMs) continue;

      const distM = haversine(eu, p);
      if (distM > this.cfg.radiusM) continue;

      out.push({
        id: outroId,
        nome: p.nome || '',
        distM: Math.round(distM),
        aheadM: Math.round(p.runM - eu.runM),
        goalKm: p.goalKm,
      });
    }

    out.sort((a, b) => a.distM - b.distM);
    return out.slice(0, this.cfg.maxPlayers);
  }

  get size() { return this.players.size; }
}

/**
 * Roteador compartilhado pelos dois invólucros.
 * Recebe {method, path, body} já decodificados e devolve {status, json}.
 */
export function handle(presence, { method, path, body }, now = Date.now()) {
  if (path === '/api/health') {
    presence.sweep(now);
    return { status: 200, json: { ok: true, online: presence.size } };
  }

  if (path === '/api/presence') {
    if (method !== 'POST') return { status: 405, json: { error: 'use POST' } };
    const entry = sanitize(body);
    if (!entry) return { status: 400, json: { error: 'dados invalidos' } };
    return { status: 200, json: { ok: true, players: presence.update(entry, now) } };
  }

  return { status: 404, json: { error: 'rota desconhecida' } };
}

/** Cabeçalhos de CORS: o jogo é servido de outra origem (GitHub Pages). */
export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
