// Recebe o base64 de um PNG na entrada padrão e grava ampliado, sem suavizar.
//
// Serve para olhar uma tela de 160×144 do jogo: nesse tamanho não dá para
// julgar legibilidade nem contraste, e qualquer visualizador que interpole
// mente sobre como o pixel art fica de verdade.
//
//   node tools/v2/tela.mjs <saida.png> [escala]
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [, , saida = 'tela.png', escalaArg = '4'] = process.argv;
const escala = Number(escalaArg);

const b64 = fs.readFileSync(0, 'utf8').trim().replace(/^"|"$/g, '').replace(/^data:image\/png;base64,/, '');
const src = PNG.sync.read(Buffer.from(b64, 'base64'));

// Transparente vira magenta: nenhum asset do jogo usa essa cor, então o que
// aparecer magenta é buraco de verdade. Sem isso o alfa some no visualizador e
// não dá para saber se o recorte de céu funcionou.
const out = new PNG({ width: src.width * escala, height: src.height * escala });
for (let y = 0; y < out.height; y++) {
  for (let x = 0; x < out.width; x++) {
    const s = (((y / escala) | 0) * src.width + ((x / escala) | 0)) * 4;
    const d = (y * out.width + x) * 4;
    if (src.data[s + 3] < 128) {
      out.data[d] = 255; out.data[d + 1] = 0; out.data[d + 2] = 255; out.data[d + 3] = 255;
      continue;
    }
    out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1];
    out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = 255;
  }
}
fs.writeFileSync(saida, PNG.sync.write(out));
console.log(`${saida}  ${out.width}x${out.height}`);
