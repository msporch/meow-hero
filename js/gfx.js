// Camada de desenho: canvas 160x144, paleta indexada (js/config.js), helpers de
// blit e primitivas. Tudo aqui recebe ÍNDICE de cor, nunca hex — foi o que
// permitiu trocar os 4 tons de verde da v1 pela paleta colorida sem reescrever
// as telas uma a uma.
import { W, H, PALETTE } from './config.js';
import { initFont } from './font.js';

export let canvas = null;
export let ctx = null;

export function initGfx(el) {
  canvas = el;
  canvas.width = W;
  canvas.height = H;
  ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;
  initFont(PALETTE);
  return ctx;
}

/** Limpa a tela com uma cor da paleta. */
export function clear(color = 3) {
  ctx.fillStyle = PALETTE[color];
  ctx.fillRect(0, 0, W, H);
}

export function rect(x, y, w, h, color) {
  ctx.fillStyle = PALETTE[color];
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function rectOutline(x, y, w, h, color) {
  ctx.fillStyle = PALETTE[color];
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  ctx.fillRect(x, y, w, 1);
  ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h);
  ctx.fillRect(x + w - 1, y, 1, h);
}

/** Painel de diálogo estilo GB: fundo claro, borda dupla. */
export function panel(x, y, w, h) {
  rect(x, y, w, h, 3);
  rectOutline(x, y, w, h, 0);
  rectOutline(x + 2, y + 2, w - 4, h - 4, 1);
}

/**
 * Padrões de xadrez pré-renderizados, um por cor e fase.
 *
 * Desenhar o dither pixel a pixel custava ~7 ms por frame em tela cheia
 * (11.520 chamadas de fillRect na tela de pausa) — 43% do orçamento de 60fps
 * num desktop, e o suficiente para travar visivelmente num celular. Como
 * padrão repetido, vira uma única chamada.
 */
const ditherCache = new Map();

function ditherPattern(color, phase) {
  const key = `${color}:${phase & 1}`;
  const hit = ditherCache.get(key);
  if (hit) return hit;

  const tile = document.createElement('canvas');
  tile.width = tile.height = 2;
  const g = tile.getContext('2d');
  g.fillStyle = PALETTE[color];
  const p = phase & 1;
  g.fillRect(p, 0, 1, 1);
  g.fillRect(1 - p, 1, 1, 1);

  const pat = ctx.createPattern(tile, 'repeat');
  ditherCache.set(key, pat);
  return pat;
}

/** Padrão xadrez 50% — sombras e meios-tons sem gastar uma cor da paleta. */
export function dither(x, y, w, h, color, phase = 0) {
  ctx.fillStyle = ditherPattern(color, phase);
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** Barra de progresso estilo GB. */
export function progressBar(x, y, w, h, t, fill = 0, bg = 3) {
  rect(x, y, w, h, bg);
  rectOutline(x, y, w, h, fill);
  const inner = Math.max(0, Math.round((w - 4) * Math.min(1, Math.max(0, t))));
  if (inner > 0) rect(x + 2, y + 2, inner, h - 4, fill);
}
