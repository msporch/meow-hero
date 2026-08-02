// Geração procedural do percurso a partir da meta de distância.
// Determinístico: a mesma meta gera sempre o mesmo trajeto.
//
// O jogo é passivo — o celular fica no bolso. Não há obstáculos nem pulo:
// o percurso existe para dar ritmo visual e marcar o progresso.
import { PX_PER_M, CHUNK_PX, FINALE_M, GROUND_Y } from './config.js';

/** PRNG rápido e determinístico. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(a, b) {
  let h = 2166136261 >>> 0;
  for (const v of [a, b]) {
    h ^= v & 0xff;          h = Math.imul(h, 16777619);
    h ^= (v >>> 8) & 0xff;  h = Math.imul(h, 16777619);
    h ^= (v >>> 16) & 0xff; h = Math.imul(h, 16777619);
    h ^= (v >>> 24) & 0xff; h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// A poça ficou ilegível na escala final e não entra no cenário.
const DECOS = ['streetlight', 'bush', 'hydrant', 'trash_bin', 'cone', 'box'];

export class Course {
  /**
   * @param {number} goalKm meta em quilômetros
   * @param {number} seed   semente (mesma meta + mesma semente = mesmo percurso)
   */
  constructor(goalKm, seed = 1) {
    this.goalKm = goalKm;
    this.goalM = goalKm * 1000;
    this.lengthPx = this.goalM * PX_PER_M;
    this.seed = seed;
    this.finaleStartPx = Math.max(0, (this.goalM - FINALE_M) * PX_PER_M);
    this._chunks = new Map();
    this._taken = new Set();
    this.coinsTotal = 0;      // contabilizado conforme os chunks são gerados
  }

  get totalChunks() { return Math.ceil(this.lengthPx / CHUNK_PX); }

  chunk(i) {
    let c = this._chunks.get(i);
    if (c) return c;

    c = this._build(i);
    this._chunks.set(i, c);

    // Cache enxuto: descarta chunks bem para trás.
    if (this._chunks.size > 24) {
      for (const k of [...this._chunks.keys()]) {
        if (k < i - 8) this._chunks.delete(k);
        if (this._chunks.size <= 16) break;
      }
    }
    return c;
  }

  _build(i) {
    const x0 = i * CHUNK_PX;
    const rnd = mulberry32(hash2(this.seed ^ 0x9e3779b9, i));
    const items = [];
    const decos = [];
    const signs = [];

    const inFinale = x0 + CHUNK_PX > this.finaleStartPx;

    // ---- Marcos de quilômetro ----
    const kmFrom = Math.floor(x0 / (1000 * PX_PER_M));
    const kmTo = Math.floor((x0 + CHUNK_PX) / (1000 * PX_PER_M));
    // Começa em kmFrom (não kmFrom+1): quando o chunk abre exatamente sobre o
    // marco, kmFrom já é aquele quilômetro e a placa seria pulada. O teste de
    // intervalo abaixo é que garante uma única placa por marco.
    for (let km = Math.max(1, kmFrom); km <= kmTo; km++) {
      const px = km * 1000 * PX_PER_M;
      if (px >= x0 && px < x0 + CHUNK_PX && km * 1000 < this.goalM) {
        signs.push({ type: 'sign', x: px, km });
      }
    }

    // ---- Cenário de rua ----
    let dx = x0 + rnd() * 50;
    while (dx < x0 + CHUNK_PX) {
      const type = DECOS[(rnd() * DECOS.length) | 0];
      decos.push({ type, x: Math.round(dx) });
      dx += 55 + rnd() * 95;
    }

    if (inFinale) {
      // A reta final fica limpa: só o gato, o caminhão e a tensão.
      return { i, x0, items, decos: decos.slice(0, 2), signs, finale: true };
    }

    // ---- Moedas ----
    // Alturas variadas só por estética — tudo é coletado automaticamente.
    // Dois agrupamentos por chunk dão um ritmo visual bom: aparece um punhado
    // de moedas a cada meia tela, sem virar tapete de moedas.
    const nRows = 2;
    for (let r = 0; r < nRows; r++) {
      const cx = x0 + 16 + (r * 0.5 + rnd() * 0.4) * (CHUNK_PX - 110);
      const n = 4 + ((rnd() * 3) | 0);
      const shape = rnd();
      for (let k = 0; k < n; k++) {
        let y;
        if (shape < 0.4) {
          y = GROUND_Y - 26;                                    // fileira baixa
        } else if (shape < 0.75) {
          y = GROUND_Y - 26 - Math.round(Math.sin((k / (n - 1)) * Math.PI) * 22);  // arco
        } else {
          y = GROUND_Y - 26 - Math.round((k / Math.max(1, n - 1)) * 20);           // escada
        }
        items.push({ type: 'coin', x: Math.round(cx + k * 15), y, id: `c${i}_${r}_${k}` });
      }
    }

    // ---- Leite: bônus de tempo, raro ----
    if (rnd() < 0.16) {
      items.push({
        type: 'milk',
        x: Math.round(x0 + 40 + rnd() * (CHUNK_PX - 80)),
        y: GROUND_Y - 30,
        id: `m${i}`,
      });
    }

    this.coinsTotal += items.filter(it => it.type === 'coin').length;
    return { i, x0, items, decos, signs, finale: false };
  }

  /** Todos os chunks visíveis na janela [fromPx, toPx]. */
  visibleChunks(fromPx, toPx) {
    const a = Math.max(0, Math.floor(fromPx / CHUNK_PX));
    const b = Math.floor(toPx / CHUNK_PX);
    const out = [];
    for (let i = a; i <= b; i++) out.push(this.chunk(i));
    return out;
  }

  isTaken(id) { return this._taken.has(id); }
  take(id) { this._taken.add(id); }
}
