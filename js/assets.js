// Carrega o atlas gerado pelo PixelLab e expõe sprites/animações prontos para blit.
import { ctx } from './gfx.js';

export const A = {
  loaded: false,
  sprites: {},   // nome → { img, w, h, anchorX, anchorY }
  anims: {},     // nome → { img, fw, fh, frames, anchorX, anchorY }
  missing: [],
};

function loadImage(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

export async function loadAssets(base = 'assets/') {
  let atlas;
  try {
    const res = await fetch(`${base}atlas.json`, { cache: 'no-cache' });
    atlas = await res.json();
  } catch {
    A.loaded = true;
    A.missing.push('atlas.json');
    return A;
  }

  const jobs = [];

  for (const [name, s] of Object.entries(atlas.sprites || {})) {
    jobs.push(loadImage(base + s.file).then(img => {
      if (!img) { A.missing.push(name); return; }
      A.sprites[name] = { img, w: s.w, h: s.h, anchorX: s.anchorX ?? 0, anchorY: s.anchorY ?? 0, tile: s.tile, cols: s.cols };
    }));
  }

  for (const [name, a] of Object.entries(atlas.anims || {})) {
    jobs.push(loadImage(base + a.file).then(img => {
      if (!img) { A.missing.push(name); return; }
      A.anims[name] = { img, fw: a.fw, fh: a.fh, frames: a.frames, anchorX: a.anchorX ?? 0, anchorY: a.anchorY ?? a.fh };
    }));
  }

  await Promise.all(jobs);
  buildRival();
  A.loaded = true;
  return A;
}

/**
 * Gera a silhueta usada para os outros jogadores: o mesmo sprite do herói
 * chapado no tom mais escuro.
 *
 * Com só 4 cores não há transparência real, e um segundo corredor em tons
 * cheios seria confundido com o jogador. A silhueta lê como "outra pessoa" e
 * sai de graça do sprite que já existe.
 */
function buildRival() {
  const src = A.anims.hero_run;
  if (!src) return;

  const rv = document.createElement('canvas');
  rv.width = src.img.width; rv.height = src.img.height;
  const rg = rv.getContext('2d');
  rg.imageSmoothingEnabled = false;
  rg.drawImage(src.img, 0, 0);
  // Silhueta na tinta escura da paleta: em cor o rival precisa ler como
  // "outra pessoa ao longe", não como uma cópia do jogador.
  const rpx = rg.getImageData(0, 0, rv.width, rv.height);
  for (let i = 0; i < rpx.data.length; i += 4) {
    if (rpx.data[i + 3] < 128) continue;
    rpx.data[i] = 0x1e; rpx.data[i + 1] = 0x24; rpx.data[i + 2] = 0x36;
  }
  rg.putImageData(rpx, 0, 0);
  A.anims.rival_run = { img: rv, fw: src.fw, fh: src.fh, frames: src.frames,
    anchorX: src.anchorX, anchorY: src.anchorY };
}

/** Desenha um sprite ancorado pela base (pés) e centro horizontal. */
export function drawSprite(name, x, groundY, { flip = false, alphaDither = false } = {}) {
  const s = A.sprites[name];
  if (!s) return false;
  const dx = Math.round(x - s.anchorX);
  const dy = Math.round(groundY - s.anchorY);
  if (flip) {
    ctx.save();
    ctx.translate(dx + s.w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(s.img, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(s.img, dx, dy);
  }
  void alphaDither;
  return true;
}

/** Desenha o frame `frame` de uma animação, ancorado pela base. */
export function drawAnim(name, frame, x, groundY, { flip = false } = {}) {
  const a = A.anims[name];
  if (!a) return false;
  const f = ((frame % a.frames) + a.frames) % a.frames;
  const dx = Math.round(x - a.anchorX);
  const dy = Math.round(groundY - a.anchorY);
  if (flip) {
    ctx.save();
    ctx.translate(dx + a.fw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(a.img, f * a.fw, 0, a.fw, a.fh, 0, 0, a.fw, a.fh);
    ctx.restore();
  } else {
    ctx.drawImage(a.img, f * a.fw, 0, a.fw, a.fh, dx, dy, a.fw, a.fh);
  }
  return true;
}

/** Repete a faixa de chão horizontalmente a partir de um deslocamento de mundo. */
export function drawGround(offsetPx, y, screenW) {
  const g = A.sprites.ground;
  if (!g) return false;
  const tw = g.w;
  let x = -(((offsetPx % tw) + tw) % tw);
  while (x < screenW) {
    ctx.drawImage(g.img, Math.round(x), Math.round(y));
    x += tw;
  }
  return true;
}

export function spriteSize(name) {
  const s = A.sprites[name] || A.anims[name];
  if (!s) return { w: 0, h: 0 };
  return { w: s.w ?? s.fw, h: s.h ?? s.fh };
}
