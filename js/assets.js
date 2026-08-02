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
  A.loaded = true;
  return A;
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
