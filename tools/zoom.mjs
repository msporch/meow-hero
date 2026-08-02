// Utilitário de inspeção: amplia um PNG por N e opcionalmente desenha uma grade de tiles.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const [, , src, dst, scaleArg, gridArg] = process.argv;
const scale = Number(scaleArg || 6);
const grid = Number(gridArg || 0);

const p = PNG.sync.read(fs.readFileSync(src));
const out = new PNG({ width: p.width * scale, height: p.height * scale });

for (let y = 0; y < out.height; y++) {
  for (let x = 0; x < out.width; x++) {
    const si = (((y / scale) | 0) * p.width + ((x / scale) | 0)) * 4;
    const di = (y * out.width + x) * 4;
    const a = p.data[si + 3];
    if (a < 128) {
      // xadrez para enxergar a transparência
      const c = (((x / scale / 4) | 0) + ((y / scale / 4) | 0)) % 2 ? 210 : 160;
      out.data[di] = c; out.data[di + 1] = 40; out.data[di + 2] = c; out.data[di + 3] = 255;
    } else {
      out.data[di] = p.data[si]; out.data[di + 1] = p.data[si + 1];
      out.data[di + 2] = p.data[si + 2]; out.data[di + 3] = 255;
    }
  }
}

if (grid > 0) {
  for (let gy = 0; gy <= p.height; gy += grid) {
    for (let x = 0; x < out.width; x++) {
      const di = (Math.min(out.height - 1, gy * scale) * out.width + x) * 4;
      out.data[di] = 255; out.data[di + 1] = 0; out.data[di + 2] = 0;
    }
  }
  for (let gx = 0; gx <= p.width; gx += grid) {
    for (let y = 0; y < out.height; y++) {
      const di = (y * out.width + Math.min(out.width - 1, gx * scale)) * 4;
      out.data[di] = 255; out.data[di + 1] = 0; out.data[di + 2] = 0;
    }
  }
}

fs.writeFileSync(dst, PNG.sync.write(out));
console.log(`${dst} ${out.width}x${out.height}`);
