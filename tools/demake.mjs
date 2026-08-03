// Fase 4: converte tudo para a paleta DMG (4 tons), recorta, empacota em strips
// e gera assets/atlas.json com as âncoras usadas pelo jogo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { DMG } from './gbpalette.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RAW = path.join(ROOT, 'assets', '_raw');
const OUT = path.join(ROOT, 'assets');
fs.mkdirSync(path.join(OUT, 'sprites'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });

const ALPHA_CUT = 128;

// Bayer 4x4 normalizado para (-0.5 .. +0.5)
const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
].map(r => r.map(v => v / 16 - 0.5));

const read = f => PNG.sync.read(fs.readFileSync(f));
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Percentis de luminância dos pixels opacos — evita que um único highlight estoure a escala. */
function lumRange(pngs) {
  const vals = [];
  for (const p of pngs) {
    for (let i = 0; i < p.data.length; i += 4) {
      if (p.data[i + 3] >= ALPHA_CUT) vals.push(lum(p.data[i], p.data[i + 1], p.data[i + 2]));
    }
  }
  if (!vals.length) return [0, 255];
  vals.sort((a, b) => a - b);
  const at = q => vals[Math.min(vals.length - 1, Math.max(0, Math.round(q * (vals.length - 1))))];
  let lo = at(0.02), hi = at(0.98);
  if (hi - lo < 24) { lo = vals[0]; hi = vals[vals.length - 1]; }
  if (hi - lo < 1) { lo = 0; hi = 255; }
  return [lo, hi];
}

/** Quantiza um PNG para os 4 tons DMG. Escreve in-place num novo PNG. */
function quantize(src, [lo, hi], { dither = false, invert = false } = {}) {
  const out = new PNG({ width: src.width, height: src.height });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      if (src.data[i + 3] < ALPHA_CUT) {
        out.data[i] = out.data[i + 1] = out.data[i + 2] = out.data[i + 3] = 0;
        continue;
      }
      let t = (lum(src.data[i], src.data[i + 1], src.data[i + 2]) - lo) / (hi - lo);
      t = Math.min(1, Math.max(0, t));
      if (invert) t = 1 - t;

      let lvl = t * 3 + (dither ? BAYER[y & 3][x & 3] * 0.9 : 0);
      lvl = Math.min(3, Math.max(0, Math.round(lvl)));

      const [r, g, b] = DMG[lvl];
      out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
    }
  }
  return out;
}

/** Caixa delimitadora dos pixels opacos, unida entre vários frames. */
function unionBBox(pngs) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (const p of pngs) {
    for (let y = 0; y < p.height; y++) {
      for (let x = 0; x < p.width; x++) {
        if (p.data[(y * p.width + x) * 4 + 3] >= ALPHA_CUT) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: pngs[0].width, h: pngs[0].height };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(src, box) {
  const out = new PNG({ width: box.w, height: box.h });
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const si = ((y + box.y) * src.width + (x + box.x)) * 4;
      const di = (y * box.w + x) * 4;
      out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

/**
 * Reduz pixel art por um divisor inteiro escolhendo a cor dominante de cada bloco.
 * Empate vai para a cor mais escura, o que preserva os contornos ao encolher.
 */
function downscale(src, d) {
  if (d <= 1) return src;
  const w = Math.max(1, Math.floor(src.width / d));
  const h = Math.max(1, Math.floor(src.height / d));
  const out = new PNG({ width: w, height: h });

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const count = new Map();
      let opaque = 0, total = 0;
      for (let by = 0; by < d; by++) {
        for (let bx = 0; bx < d; bx++) {
          const sx = x * d + bx, sy = y * d + by;
          if (sx >= src.width || sy >= src.height) continue;
          total++;
          const si = (sy * src.width + sx) * 4;
          if (src.data[si + 3] < ALPHA_CUT) continue;
          opaque++;
          const lvl = DMG.findIndex(c => c[0] === src.data[si] && c[1] === src.data[si + 1] && c[2] === src.data[si + 2]);
          const k = lvl < 0 ? 0 : lvl;
          count.set(k, (count.get(k) || 0) + 1);
        }
      }
      const di = (y * w + x) * 4;
      // 40% de cobertura basta: mais que isso apaga sprites finos (poste, placa).
      if (!opaque || opaque < total * 0.4) {
        out.data[di] = out.data[di + 1] = out.data[di + 2] = out.data[di + 3] = 0;
        continue;
      }
      let best = 0, bestN = -1;
      for (const [lvl, n] of count) {
        if (n > bestN || (n === bestN && lvl < best)) { best = lvl; bestN = n; }
      }
      const [r, g, b] = DMG[best];
      out.data[di] = r; out.data[di + 1] = g; out.data[di + 2] = b; out.data[di + 3] = 255;
    }
  }
  return out;
}

/** Junta frames lado a lado num strip horizontal. */
function strip(frames) {
  const fw = frames[0].width, fh = frames[0].height;
  const out = new PNG({ width: fw * frames.length, height: fh });
  frames.forEach((f, n) => {
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const si = (y * fw + x) * 4;
        const di = (y * out.width + n * fw + x) * 4;
        out.data[di] = f.data[si]; out.data[di + 1] = f.data[si + 1];
        out.data[di + 2] = f.data[si + 2]; out.data[di + 3] = f.data[si + 3];
      }
    }
  });
  return out;
}

const write = (p, png) => fs.writeFileSync(p, PNG.sync.write(png, { colorType: 6 }));
const files = fs.readdirSync(RAW);
const atlas = { palette: DMG.map(c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')), sprites: {}, anims: {} };

// ---------- 1. Animações (grupos <nome>_NN.png) ----------
const groups = {};
for (const f of files) {
  const mm = f.match(/^(.+)_(\d{2})\.png$/);
  if (mm) (groups[mm[1]] ??= []).push({ n: Number(mm[2]), f });
}

/**
 * Empurra o sprite para a metade escura da paleta.
 *
 * O fundo do jogo é achatado nos tons claros (ver flatten), então um
 * personagem claro simplesmente desaparece — foi o que aconteceu com as skins
 * Neon e Astro, que sumiram contra os prédios. Aqui os 4 níveis viram 3
 * (0, 1, 2), preservando contorno e sombreado mas garantindo que o primeiro
 * plano sempre tenha mais peso que o cenário.
 */
const NIVEL_DE = new Map(DMG.map((c, i) => [c.join(','), i]));
const nivelDoPixel = (d, i) => NIVEL_DE.get(`${d[i]},${d[i + 1]},${d[i + 2]}`) ?? 0;

function paraPrimeiroPlano(png) {
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < ALPHA_CUT) continue;
    const novo = Math.round(nivelDoPixel(png.data, i) * 2 / 3);
    const [r, g, b] = DMG[novo];
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b;
  }
  return png;
}

/** Nível médio dos pixels opacos de um conjunto de frames (0 = escuro). */
function nivelMedio(pngs) {
  let soma = 0, n = 0;
  for (const p of pngs) {
    for (let i = 0; i < p.data.length; i += 4) {
      if (p.data[i + 3] < ALPHA_CUT) continue;
      soma += nivelDoPixel(p.data, i); n++;
    }
  }
  return n ? soma / n : 0;
}

/**
 * Escurece mais um degrau. Necessário para sprites brancos: o fantasma, mesmo
 * depois do ajuste padrão, continuava quase todo no tom claro e desaparecia
 * contra os prédios. Aplicado só quando a média ainda está clara demais, para
 * não achatar as skins que já estavam boas.
 */
function escureceMais(png) {
  for (let i = 0; i < png.data.length; i += 4) {
    if (png.data[i + 3] < ALPHA_CUT) continue;
    const [r, g, b] = DMG[Math.max(0, nivelDoPixel(png.data, i) - 1)];
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b;
  }
  return png;
}

for (const [name, list] of Object.entries(groups)) {
  list.sort((a, b) => a.n - b.n);
  const pngs = list.map(e => read(path.join(RAW, e.f)));
  const range = lumRange(pngs);
  let q = pngs.map(p => paraPrimeiroPlano(quantize(p, range, { dither: false })));
  // Sprite ainda claro demais depois do ajuste padrão: escurece outro degrau.
  const CLARO_DEMAIS = 1.45;
  if (nivelMedio(q) > CLARO_DEMAIS) {
    q = q.map(escureceMais);
    console.log(`  · ${name}: escurecido a mais (estava claro demais para o fundo)`);
  }
  const box = unionBBox(q);
  const framesC = q.map(p => crop(p, box));
  const out = strip(framesC);
  const file = `sprites/${name}.png`;
  write(path.join(OUT, file), out);
  atlas.anims[name] = {
    file, fw: box.w, fh: box.h, frames: framesC.length,
    anchorX: Math.round(box.w / 2), anchorY: box.h,   // pés / base
  };
  console.log(`anim ${name.padEnd(12)} ${box.w}x${box.h} x${framesC.length}`);
}

// ---------- 2. Sprites soltos ----------
// O PixelLab entrega tudo preenchendo um canvas de 32-96px; o herói tem 42px de
// altura, então os objetos de rua precisam encolher para a escala ficar crível.
// Divisores escolhidos olhando o contact sheet: ÷3 apagava o desenho da moeda
// e do coração, que precisam continuar reconhecíveis a 15px.
const SINGLES = {
  coin: 2, milk: 2, trash_bin: 2, cone: 2, box: 2, puddle: 2,
  hydrant: 2, sign: 2, streetlight: 2, bush: 2, truck: 1, heart: 2,
};
for (const [name, div] of Object.entries(SINGLES)) {
  const src = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(src)) { console.log(`· sem ${name}`); continue; }
  const p = read(src);
  const q = quantize(p, lumRange([p]), { dither: false });
  const box = unionBBox([q]);
  const c = downscale(crop(q, box), div);
  const file = `sprites/${name}.png`;
  write(path.join(OUT, file), c);
  atlas.sprites[name] = { file, w: c.width, h: c.height, anchorX: Math.round(c.width / 2), anchorY: c.height };
  console.log(`spr  ${name.padEnd(12)} ${c.width}x${c.height}${div > 1 ? `  (÷${div})` : ''}`);
}

/**
 * Torna o céu transparente por flood fill a partir da borda de cima, só na cor
 * mais clara. Assim as camadas de parallax se sobrepõem de verdade, sem apagar
 * janelas claras dentro dos prédios (elas não encostam na borda).
 */
function keySky(png) {
  const { width: w, height: h } = png;
  const at = (x, y) => (y * w + x) * 4;
  const isLightest = i =>
    png.data[i + 3] >= ALPHA_CUT &&
    png.data[i] === DMG[3][0] && png.data[i + 1] === DMG[3][1] && png.data[i + 2] === DMG[3][2];

  const stack = [];
  for (let x = 0; x < w; x++) {
    if (isLightest(at(x, 0))) stack.push([x, 0]);
  }
  const seen = new Uint8Array(w * h);

  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    if (seen[y * w + x]) continue;
    const i = at(x, y);
    if (!isLightest(i)) continue;
    seen[y * w + x] = 1;
    png.data[i + 3] = 0;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return png;
}

/**
 * Achata a camada num único tom e, opcionalmente, aplica xadrez de 50% no alfa.
 *
 * Com só 4 cores, a legibilidade depende de reservar os tons escuros para o que
 * é jogável. As camadas de fundo viram silhuetas claras e chapadas; o herói,
 * que tem contorno no tom mais escuro, destaca-se sempre. O xadrez dá a
 * sensação de distância na camada mais ao fundo.
 */
function flatten(png, tone, { halftone = false } = {}) {
  const [r, g, b] = DMG[tone];
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] < ALPHA_CUT) { png.data[i + 3] = 0; continue; }
      if (halftone && ((x + y) & 1)) { png.data[i + 3] = 0; continue; }
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }
  return png;
}

/** Remove as linhas totalmente opacas do rodapé (a faixa de chão da camada). */
function cropSolidBottom(png) {
  const { width: w, height: h } = png;
  let cut = h;
  for (let y = h - 1; y >= 0; y--) {
    let solid = true;
    for (let x = 0; x < w; x++) {
      if (png.data[(y * w + x) * 4 + 3] < ALPHA_CUT) { solid = false; break; }
    }
    if (!solid) break;
    cut = y;
  }
  if (cut >= h) return png;
  return crop(png, { x: 0, y: 0, w, h: cut });
}

// ---------- 3. Cenas (com dither leve) ----------
for (const name of ['bg_sky', 'bg_city', 'title_art']) {
  const src = path.join(RAW, `${name}.png`);
  if (!fs.existsSync(src)) continue;
  const p = read(src);
  let q = quantize(p, lumRange([p]), { dither: true });
  // As camadas de fundo viram silhuetas recortadas; a arte de título fica opaca.
  if (name !== 'title_art') {
    q = keySky(q);
    // A camada gerada traz uma faixa de chão sólida embaixo que, achatada,
    // vira um bloco cheio e esconde a silhueta. Recorta essas linhas.
    q = cropSolidBottom(q);
    // Longe: silhueta esmaecida. Perto: silhueta chapada, mesmo tom.
    q = flatten(q, 2, { halftone: name === 'bg_sky' });
  }
  const file = `sprites/${name}.png`;
  write(path.join(OUT, file), q);
  atlas.sprites[name] = { file, w: q.width, h: q.height, anchorX: 0, anchorY: 0 };
  console.log(`cena ${name.padEnd(12)} ${q.width}x${q.height}`);
}

// ---------- 4. Tileset ----------
{
  const src = path.join(RAW, 'tileset_road.png');
  if (fs.existsSync(src)) {
    const p = read(src);
    const q = quantize(p, lumRange([p]), { dither: false });
    write(path.join(OUT, 'sprites/tileset_road.png'), q);
    atlas.sprites.tileset_road = { file: 'sprites/tileset_road.png', w: q.width, h: q.height, tile: 16, cols: q.width / 16, anchorX: 0, anchorY: 0 };
    console.log(`tile tileset_road  ${q.width}x${q.height}`);
  }
}

// ---------- 4b. Faixa de chão pronta (asfalto + calçada) ----------
// Do tileset gerado, o tile 3 (linha 0, col 3) é a superfície da calçada e o
// tile 6 (linha 1, col 2) é o corpo de asfalto. Compõe uma faixa 16xGROUND_H
// que o jogo só precisa repetir na horizontal.
{
  const src = path.join(RAW, 'tileset_road.png');
  if (fs.existsSync(src)) {
    const p = read(src);
    const q = quantize(p, lumRange([p]), { dither: false });
    const T = 16, GROUND_H = 28;
    const tileAt = n => ({ tx: (n % 4) * T, ty: Math.floor(n / 4) * T });
    const SURFACE = tileAt(3), FILL = tileAt(6);

    const g = new PNG({ width: T, height: GROUND_H });
    const px = (img, sx, sy) => {
      const i = (sy * img.width + sx) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
    };

    // A banda opaca do tile de superfície não começa necessariamente em y=0
    // (aqui ela fica na metade de baixo). Descobre a primeira linha opaca e
    // desloca para que a calçada encoste no topo da faixa.
    let skip = 0;
    for (let y = 0; y < T; y++) {
      let opaque = false;
      for (let x = 0; x < T; x++) if (px(q, SURFACE.tx + x, SURFACE.ty + y)[3] >= ALPHA_CUT) { opaque = true; break; }
      if (opaque) { skip = y; break; }
    }

    for (let y = 0; y < GROUND_H; y++) {
      for (let x = 0; x < T; x++) {
        // Base: asfalto repetido verticalmente.
        let [r, gg, b] = px(q, FILL.tx + x, FILL.ty + (y % T));
        // Sobrepõe a calçada no topo, onde ela for opaca.
        if (y < T - skip) {
          const s = px(q, SURFACE.tx + x, SURFACE.ty + y + skip);
          if (s[3] >= ALPHA_CUT) { r = s[0]; gg = s[1]; b = s[2]; }
        }
        const di = (y * T + x) * 4;
        g.data[di] = r; g.data[di + 1] = gg; g.data[di + 2] = b; g.data[di + 3] = 255;
      }
    }
    write(path.join(OUT, 'sprites/ground.png'), g);
    atlas.sprites.ground = { file: 'sprites/ground.png', w: T, h: GROUND_H, anchorX: 0, anchorY: 0 };
    console.log(`chao ground        ${T}x${GROUND_H}`);
  }
}

// ---------- 5. Ícones do PWA ----------
function icon(size) {
  const png = new PNG({ width: size, height: size });
  const [dr, dg, db] = DMG[0], [lr, lg, lb] = DMG[3];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const edge = x < size * 0.06 || y < size * 0.06 || x > size * 0.94 || y > size * 0.94;
      const [r, g, b] = edge ? [dr, dg, db] : [lr, lg, lb];
      png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
    }
  }
  // Estampa o gato no centro.
  const catSrc = path.join(RAW, 'cat_idle_00.png');
  if (fs.existsSync(catSrc)) {
    const c = read(catSrc);
    const q = quantize(c, lumRange([c]), {});
    const box = unionBBox([q]);
    const cc = crop(q, box);
    const scale = Math.max(1, Math.floor((size * 0.62) / Math.max(cc.width, cc.height)));
    const ox = Math.round((size - cc.width * scale) / 2);
    const oy = Math.round((size - cc.height * scale) / 2);
    for (let y = 0; y < cc.height * scale; y++) {
      for (let x = 0; x < cc.width * scale; x++) {
        const si = ((y / scale | 0) * cc.width + (x / scale | 0)) * 4;
        if (cc.data[si + 3] < ALPHA_CUT) continue;
        const px = ox + x, py = oy + y;
        if (px < 0 || py < 0 || px >= size || py >= size) continue;
        const di = (py * size + px) * 4;
        png.data[di] = cc.data[si]; png.data[di + 1] = cc.data[si + 1];
        png.data[di + 2] = cc.data[si + 2]; png.data[di + 3] = 255;
      }
    }
  }
  write(path.join(OUT, `icons/icon-${size}.png`), png);
  console.log(`icon ${size}x${size}`);
}
icon(192);
icon(512);

fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(atlas, null, 2));
console.log('\natlas.json escrito.');
