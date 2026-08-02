// Camada de desenho: canvas 160x144, paleta DMG, helpers de blit e primitivas.
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

/** Padrão xadrez 50% — usado para sombras e gradientes na paleta de 4 cores. */
export function dither(x, y, w, h, color, phase = 0) {
  ctx.fillStyle = PALETTE[color];
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  for (let j = 0; j < h; j++) {
    for (let i = (j + phase) % 2; i < w; i += 2) {
      ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/** Barra de progresso estilo GB. */
export function progressBar(x, y, w, h, t, fill = 0, bg = 3) {
  rect(x, y, w, h, bg);
  rectOutline(x, y, w, h, fill);
  const inner = Math.max(0, Math.round((w - 4) * Math.min(1, Math.max(0, t))));
  if (inner > 0) rect(x + 2, y + 2, inner, h - 4, fill);
}
