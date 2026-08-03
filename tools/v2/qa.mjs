// QA das animações: checagem técnica + folhas de contato para inspeção visual.
//
// A checagem programática pega o que o olho perde num zoom de 5×: altura fora
// do padrão, número de frames errado, âncora que treme, alfa meio-transparente
// (vira halo no jogo), contraste baixo contra o céu, paleta estourada.
//
// A folha de contato existe porque nenhuma métrica detecta "esse ficou
// estranho". Anatomia deformada, roupa que sumiu, pose quebrada — isso só se
// vê olhando, frame a frame.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const RAW = path.join(ROOT, 'assets', '_v2raw');
const SAIDA = path.join(ROOT, 'assets', '_qa');
fs.mkdirSync(SAIDA, { recursive: true });

const ALPHA_CUT = 128;
const CEU = [168, 196, 224];
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const read = f => PNG.sync.read(fs.readFileSync(f));

/** Caixa dos pixels opacos de UM frame. */
function caixa(p) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      if (p.data[(y * p.width + x) * 4 + 3] >= ALPHA_CUT) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const grupos = {};
for (const f of fs.readdirSync(RAW)) {
  const m = f.match(/^(.+)_(\d{2})\.png$/);
  if (m) (grupos[m[1]] ??= []).push({ n: Number(m[2]), f });
}

const linhas = [];
const problemas = [];

for (const [nome, lista] of Object.entries(grupos).sort()) {
  lista.sort((a, b) => a.n - b.n);
  const pngs = lista.map(e => read(path.join(RAW, e.f)));
  const caixas = pngs.map(caixa).filter(Boolean);
  if (!caixas.length) { problemas.push(`${nome}: todos os frames vazios`); continue; }

  const alturas = caixas.map(c => c.h);
  const bases = caixas.map(c => c.y1);
  const hMax = Math.max(...alturas);
  const varBase = Math.max(...bases) - Math.min(...bases);

  // alfa meio-transparente
  let meioAlfa = 0, opacos = 0, somaContraste = 0;
  const cores = new Set();
  for (const p of pngs) {
    for (let i = 0; i < p.data.length; i += 4) {
      const a = p.data[i + 3];
      if (a > 0 && a < 255) meioAlfa++;
      if (a < ALPHA_CUT) continue;
      opacos++;
      cores.add(`${p.data[i]},${p.data[i + 1]},${p.data[i + 2]}`);
      somaContraste += Math.abs(lum(p.data[i], p.data[i + 1], p.data[i + 2]) - lum(...CEU));
    }
  }
  const contraste = opacos ? somaContraste / opacos : 0;

  linhas.push({ nome, frames: pngs.length, h: hMax, varBase, meioAlfa, cores: cores.size, contraste: Math.round(contraste) });

  // Contagem de frames. O idle do quadrúpede usa outro template e vem com 8;
  // os dois valores são legítimos.
  const esperado = /_run$/.test(nome) ? [8] : /_idle$/.test(nome) ? [4, 8] : /_pose$/.test(nome) ? [1] : null;
  if (esperado && !esperado.includes(pngs.length)) {
    problemas.push(`${nome}: ${pngs.length} frames, esperado ${esperado.join(' ou ')}`);
  }

  // A base de uma CORRIDA oscila de propósito: existe fase aérea. Como o
  // recorte usa a caixa unida dos frames, esse sobe-e-desce é a animação, não
  // um defeito. Num idle, porém, oscilar é o personagem flutuando.
  const limiteBase = /_run$/.test(nome) ? 10 : 3;
  if (varBase > limiteBase) {
    problemas.push(`${nome}: base oscila ${varBase}px (limite ${limiteBase}) — confira se nao esta flutuando`);
  }

  if (meioAlfa > 0) problemas.push(`${nome}: ${meioAlfa} pixels meio-transparentes — viram halo`);
  if (contraste < 40) problemas.push(`${nome}: contraste ${Math.round(contraste)} contra o ceu — some no fundo`);
  if (cores.size < 4) problemas.push(`${nome}: so ${cores.size} cor(es) — saiu chapado, sem sombreado`);
}

// ---------- altura entre skins ----------
// Bípede compara com bípede. Um gato de 56px seria absurdo, então misturar as
// duas anatomias na mesma mediana só produz alarme falso.
const QUADRUPEDES = new Set(['gato', 'cachorro']);
for (const [rotulo, filtro] of [
  ['bipedes', l => !QUADRUPEDES.has(l.nome.replace(/_run$/, ''))],
  ['quadrupedes', l => QUADRUPEDES.has(l.nome.replace(/_run$/, ''))],
]) {
  const runs = linhas.filter(l => /_run$/.test(l.nome)).filter(filtro);
  if (runs.length < 2) continue;
  const hs = runs.map(r => r.h).sort((a, b) => a - b);
  const mediana = hs[hs.length >> 1];
  for (const r of runs) {
    const desvio = Math.abs(r.h - mediana) / mediana;
    if (desvio > 0.22) {
      problemas.push(`${r.nome}: ${r.h}px contra mediana ${mediana}px dos ${rotulo} (${Math.round(desvio * 100)}% fora) — destoa do elenco`);
    }
  }
}

// ---------- tabela ----------
console.log('nome                frames  altura  base  meioAlfa  cores  contraste');
for (const l of linhas) {
  console.log(
    l.nome.padEnd(20) +
    String(l.frames).padStart(4) +
    String(l.h).padStart(8) +
    String(l.varBase).padStart(6) +
    String(l.meioAlfa).padStart(10) +
    String(l.cores).padStart(7) +
    String(l.contraste).padStart(11));
}

console.log(`\n${problemas.length ? '✗' : '✓'} ${problemas.length} problema(s)`);
problemas.forEach(p => console.log('  ' + p));

// ---------- folhas de contato ----------
const S = 3, PAD = 3;

/** Uma folha por animação: todos os frames lado a lado. */
function folhaDaAnimacao(nome, pngs) {
  const cs = pngs.map(caixa);
  const w = Math.max(...cs.filter(Boolean).map(c => c.w));
  const h = Math.max(...cs.filter(Boolean).map(c => c.h));
  const out = new PNG({ width: (w + PAD) * pngs.length * S, height: (h + PAD * 2) * S });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = CEU[0]; out.data[i + 1] = CEU[1]; out.data[i + 2] = CEU[2]; out.data[i + 3] = 255;
  }
  pngs.forEach((p, k) => {
    const c = cs[k]; if (!c) return;
    const ox = k * (w + PAD) + Math.floor((w - c.w) / 2), oy = PAD + (h - c.h);
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const s = ((y + c.y0) * p.width + (x + c.x0)) * 4;
        if (p.data[s + 3] < ALPHA_CUT) continue;
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
          const px = (ox + x) * S + dx, py = (oy + y) * S + dy;
          if (px < 0 || py < 0 || px >= out.width || py >= out.height) continue;
          const d = (py * out.width + px) * 4;
          out.data[d] = p.data[s]; out.data[d + 1] = p.data[s + 1]; out.data[d + 2] = p.data[s + 2];
        }
      }
    }
  });
  fs.writeFileSync(path.join(SAIDA, `${nome}.png`), PNG.sync.write(out));
}

/** Folha do elenco: o primeiro frame de cada corrida, para comparar entre si. */
function folhaDoElenco() {
  const itens = Object.entries(grupos)
    .filter(([n]) => /_run$/.test(n))
    .sort()
    .map(([n, l]) => {
      l.sort((a, b) => a.n - b.n);
      const p = read(path.join(RAW, l[0].f));
      return { n: n.replace(/_run$/, ''), p, c: caixa(p) };
    })
    .filter(i => i.c);

  const COLS = 7;
  const cw = Math.max(...itens.map(i => i.c.w)) + PAD * 2;
  const ch = Math.max(...itens.map(i => i.c.h)) + PAD * 2;
  const rows = Math.ceil(itens.length / COLS);
  const out = new PNG({ width: cw * COLS * S, height: ch * rows * S });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = CEU[0]; out.data[i + 1] = CEU[1]; out.data[i + 2] = CEU[2]; out.data[i + 3] = 255;
  }
  itens.forEach((it, idx) => {
    const gx = (idx % COLS) * cw + Math.floor((cw - it.c.w) / 2);
    const gy = Math.floor(idx / COLS) * ch + (ch - PAD - it.c.h);
    for (let y = 0; y < it.c.h; y++) {
      for (let x = 0; x < it.c.w; x++) {
        const s = ((y + it.c.y0) * it.p.width + (x + it.c.x0)) * 4;
        if (it.p.data[s + 3] < ALPHA_CUT) continue;
        for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
          const px = (gx + x) * S + dx, py = (gy + y) * S + dy;
          if (px < 0 || py < 0 || px >= out.width || py >= out.height) continue;
          const d = (py * out.width + px) * 4;
          out.data[d] = it.p.data[s]; out.data[d + 1] = it.p.data[s + 1]; out.data[d + 2] = it.p.data[s + 2];
        }
      }
    }
  });
  fs.writeFileSync(path.join(SAIDA, '_elenco.png'), PNG.sync.write(out));
  console.log(`\nelenco: ${itens.length} skins → assets/_qa/_elenco.png`);
}

for (const [nome, lista] of Object.entries(grupos)) {
  if (/_pose$/.test(nome)) continue;
  lista.sort((a, b) => a.n - b.n);
  folhaDaAnimacao(nome, lista.map(e => read(path.join(RAW, e.f))));
}
folhaDoElenco();
console.log(`folhas por animacao → assets/_qa/`);
process.exit(problemas.length ? 1 : 0);
