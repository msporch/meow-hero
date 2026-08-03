// Monta uma folha de contato com as telas que a página gravou em /__shot.
//
//   node tools/v2/telas.mjs <saida.png> [escala] [prefixo]
//
// A tela do jogo tem 160×144. Nesse tamanho não dá para julgar contraste nem
// legibilidade, e ver uma de cada vez esconde justamente o que interessa:
// se as telas combinam entre si.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ZOOM = path.join(ROOT, 'assets', '_raw', 'zoom');

const [, , saida = path.join(ZOOM, '_grade.png'), escalaArg = '3', prefixo = ''] = process.argv;
const escala = Number(escalaArg);
const COLS = 4, MARGEM = 4;

const nomes = fs.readdirSync(ZOOM)
  .filter(f => f.endsWith('.raw.png') && f.startsWith(prefixo))
  .sort();
if (!nomes.length) { console.log('nada em assets/_raw/zoom/'); process.exit(1); }

const ps = nomes.map(f => PNG.sync.read(fs.readFileSync(path.join(ZOOM, f))));
const cw = Math.max(...ps.map(p => p.width)) * escala + MARGEM;
const ch = Math.max(...ps.map(p => p.height)) * escala + MARGEM;
const rows = Math.ceil(ps.length / COLS);

const out = new PNG({ width: cw * COLS, height: ch * rows });
// Fundo magenta: nenhuma tela do jogo usa essa cor, então qualquer sobra
// aparecendo é buraco de composição, não arte.
for (let i = 0; i < out.data.length; i += 4) {
  out.data[i] = 255; out.data[i + 1] = 0; out.data[i + 2] = 255; out.data[i + 3] = 255;
}

ps.forEach((p, k) => {
  const ox = (k % COLS) * cw + MARGEM / 2, oy = Math.floor(k / COLS) * ch + MARGEM / 2;
  for (let y = 0; y < p.height * escala; y++) {
    for (let x = 0; x < p.width * escala; x++) {
      const s = (((y / escala) | 0) * p.width + ((x / escala) | 0)) * 4;
      const d = ((oy + y) * out.width + ox + x) * 4;
      out.data[d] = p.data[s]; out.data[d + 1] = p.data[s + 1];
      out.data[d + 2] = p.data[s + 2]; out.data[d + 3] = 255;
    }
  }
});

fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, PNG.sync.write(out));
console.log(`${nomes.length} telas → ${saida}  (${out.width}x${out.height})`);
nomes.forEach((n, i) => console.log(`  ${String.fromCharCode(65 + i)} ${n.replace('.raw.png', '')}`));
