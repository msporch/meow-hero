// Paleta DMG (Game Boy original) — 4 tons de verde.
import { PNG } from 'pngjs';

export const DMG = [
  [0x0f, 0x38, 0x0f], // 0 — mais escuro
  [0x30, 0x62, 0x30], // 1
  [0x8b, 0xac, 0x0f], // 2
  [0x9b, 0xbc, 0x0f], // 3 — mais claro
];

export const DMG_HEX = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];

/** PNG 4x1 com as 4 cores da paleta, como data: URL — usado como color_image do PixelLab. */
export function paletteDataUrl() {
  const png = new PNG({ width: 4, height: 1 });
  DMG.forEach(([r, g, b], i) => {
    const o = i * 4;
    png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255;
  });
  const buf = PNG.sync.write(png);
  return `data:image/png;base64,${buf.toString('base64')}`;
}
