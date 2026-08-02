// Contact sheet dos sprites finais, alinhados pela base, com o herói como referência de escala.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const OUT = 'assets';
const atlas = JSON.parse(fs.readFileSync(path.join(OUT, 'atlas.json'), 'utf8'));
const SCALE = 5, PAD = 6, BASE = 56;

const names = ['coin', 'milk', 'trash_bin', 'cone', 'box', 'puddle', 'hydrant', 'sign', 'streetlight', 'bush', 'heart'];
const items = [];

// herói (primeiro frame) como referência
{
  const a = atlas.anims.hero_run;
  const img = PNG.sync.read(fs.readFileSync(path.join(OUT, a.file)));
  items.push({ name: 'hero', img, sx: 0, w: a.fw, h: a.fh });
}
{
  const a = atlas.anims.cat_sit;
  const img = PNG.sync.read(fs.readFileSync(path.join(OUT, a.file)));
  items.push({ name: 'cat', img, sx: 0, w: a.fw, h: a.fh });
}
for (const n of names) {
  const s = atlas.sprites[n];
  if (!s) continue;
  const img = PNG.sync.read(fs.readFileSync(path.join(OUT, s.file)));
  items.push({ name: n, img, sx: 0, w: s.w, h: s.h });
}

const totalW = items.reduce((a, it) => a + it.w + PAD, PAD);
const out = new PNG({ width: totalW * SCALE, height: (BASE + 12) * SCALE });
for (let i = 0; i < out.data.length; i += 4) {
  out.data[i] = 155; out.data[i + 1] = 188; out.data[i + 2] = 15; out.data[i + 3] = 255;
}

function put(px, py, r, g, b) {
  for (let y = 0; y < SCALE; y++) for (let x = 0; x < SCALE; x++) {
    const i = ((py * SCALE + y) * out.width + px * SCALE + x) * 4;
    if (i < 0 || i + 3 >= out.data.length) continue;
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b;
  }
}

let cx = PAD;
for (const it of items) {
  const baseY = BASE;
  for (let y = 0; y < it.h; y++) {
    for (let x = 0; x < it.w; x++) {
      const si = (y * it.img.width + it.sx + x) * 4;
      if (it.img.data[si + 3] < 128) continue;
      put(cx + x, baseY - it.h + y, it.img.data[si], it.img.data[si + 1], it.img.data[si + 2]);
    }
  }
  // linha de base
  for (let x = 0; x < it.w; x++) put(cx + x, baseY, 15, 56, 15);
  cx += it.w + PAD;
}

fs.mkdirSync('assets/_raw/zoom', { recursive: true });
fs.writeFileSync('assets/_raw/zoom/props.png', PNG.sync.write(out));
console.log(`props.png ${out.width}x${out.height} — ${items.map(i => i.name).join(', ')}`);
