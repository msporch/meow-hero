// Fonte bitmap 5x7 desenhada à mão, no espírito das fontes de Game Boy.
// Pré-renderizada em atlas (um por cor da paleta) para blit rápido.

const GLYPHS = {
  'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
  'C': '.###.|#...#|#....|#....|#....|#...#|.###.',
  'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
  'E': '#####|#....|#....|####.|#....|#....|#####',
  'F': '#####|#....|#....|####.|#....|#....|#....',
  'G': '.###.|#...#|#....|#.###|#...#|#...#|.###.',
  'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  'I': '#####|..#..|..#..|..#..|..#..|..#..|#####',
  'J': '....#|....#|....#|....#|#...#|#...#|.###.',
  'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  'L': '#....|#....|#....|#....|#....|#....|#####',
  'M': '#...#|##.##|#.#.#|#...#|#...#|#...#|#...#',
  'N': '#...#|##..#|#.#.#|#..##|#...#|#...#|#...#',
  'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  'P': '####.|#...#|#...#|####.|#....|#....|#....',
  'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  'S': '.####|#....|#....|.###.|....#|....#|####.',
  'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  'W': '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
  'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  'Z': '#####|....#|...#.|..#..|.#...|#....|#####',

  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '#####|...#.|..##.|....#|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',

  ' ': '.....|.....|.....|.....|.....|.....|.....',
  '.': '.....|.....|.....|.....|.....|.##..|.##..',
  ',': '.....|.....|.....|.....|.##..|.##..|.#...',
  ':': '.....|.##..|.##..|.....|.##..|.##..|.....',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '-': '.....|.....|.....|#####|.....|.....|.....',
  '_': '.....|.....|.....|.....|.....|.....|#####',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  "'": '..#..|..#..|.....|.....|.....|.....|.....',
  '"': '.#.#.|.#.#.|.....|.....|.....|.....|.....',
  '%': '##..#|##.#.|..#..|.#...|#.##.|..##.|.....',
  '$': '..#..|.####|#.#..|.###.|..#.#|####.|..#..',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '=': '.....|.....|#####|.....|#####|.....|.....',
  '(': '...#.|..#..|.#...|.#...|.#...|..#..|...#.',
  ')': '.#...|..#..|...#.|...#.|...#.|..#..|.#...',
  '<': '...#.|..#..|.#...|#....|.#...|..#..|...#.',
  '>': '.#...|..#..|...#.|....#|...#.|..#..|.#...',
  '*': '.....|#.#.#|.###.|#####|.###.|#.#.#|.....',
  '#': '.#.#.|#####|.#.#.|.#.#.|#####|.#.#.|.....',
  'º': '.###.|#...#|.###.|.....|.....|.....|.....',

  // Ícones — usados como caracteres normais nas strings.
  '\x01': '.....|.#.#.|#####|#####|.###.|..#..|.....',   // coração
  '\x02': '..#..|..#..|#####|.###.|.###.|.#.#.|.....',   // estrela
  '\x03': '.....|..#..|...#.|#####|...#.|..#..|.....',   // seta →
  '\x08': '.....|..#..|.#...|#####|.#...|..#..|.....',   // seta ←
  '\x04': '#...#|##.##|#####|#.#.#|#####|.###.|.....',   // carinha de gato
  '\x05': '..##.|.####|#####|#####|.###.|..#..|.....',   // moeda
  '\x06': '#####|#####|#####|#####|#####|#####|#####',   // bloco cheio
  '\x07': '#####|#...#|#...#|#...#|#...#|#...#|#####',   // bloco vazio
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;
export const ADVANCE = 6;   // 5px + 1px de espaço
export const LINE_H = 9;

// Acentos do português são normalizados para a letra base (a fonte é 5x7, sem espaço p/ diacríticos).
const FOLD = {
  'Á':'A','À':'A','Â':'A','Ã':'A','Ä':'A','É':'E','Ê':'E','È':'E','Í':'I','Î':'I','Ì':'I',
  'Ó':'O','Ô':'O','Õ':'O','Ò':'O','Ö':'O','Ú':'U','Û':'U','Ù':'U','Ü':'U','Ç':'C','Ñ':'N',
};

const atlases = [];   // um canvas por índice de cor

/** Pré-renderiza a fonte em 4 atlas (um por cor da paleta). */
export function buildFont(paletteHex) {
  const keys = Object.keys(GLYPHS);
  const index = new Map();
  keys.forEach((k, i) => index.set(k, i));

  for (let c = 0; c < paletteHex.length; c++) {
    const cv = document.createElement('canvas');
    cv.width = keys.length * GLYPH_W;
    cv.height = GLYPH_H;
    const g = cv.getContext('2d');
    g.fillStyle = paletteHex[c];

    keys.forEach((k, i) => {
      const rows = GLYPHS[k].split('|');
      for (let y = 0; y < GLYPH_H; y++) {
        const row = rows[y] || '';
        for (let x = 0; x < GLYPH_W; x++) {
          if (row[x] === '#') g.fillRect(i * GLYPH_W + x, y, 1, 1);
        }
      }
    });
    atlases.push(cv);
  }
  return index;
}

let INDEX = null;
export function initFont(paletteHex) { INDEX = buildFont(paletteHex); }

function norm(ch) {
  const u = ch.toUpperCase();
  if (INDEX.has(u)) return u;
  const f = FOLD[u];
  if (f && INDEX.has(f)) return f;
  return '?';
}

export function textWidth(str) {
  return str.length * ADVANCE - (str.length ? 1 : 0);
}

/**
 * Desenha texto no contexto.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} str
 * @param {number} x  — canto esquerdo (ou centro/direita, ver align)
 * @param {number} y  — topo do glifo
 * @param {number} color — índice 0..3 na paleta
 * @param {'left'|'center'|'right'} align
 */
export function drawText(ctx, str, x, y, color = 0, align = 'left') {
  if (!INDEX) return;
  const s = String(str);
  const w = textWidth(s);
  let px = align === 'center' ? Math.round(x - w / 2) : align === 'right' ? Math.round(x - w) : Math.round(x);
  const atlas = atlases[color] || atlases[0];

  for (const ch of s) {
    const key = norm(ch);
    if (key !== ' ') {
      const i = INDEX.get(key);
      ctx.drawImage(atlas, i * GLYPH_W, 0, GLYPH_W, GLYPH_H, px, Math.round(y), GLYPH_W, GLYPH_H);
    }
    px += ADVANCE;
  }
  return px;
}

/** Texto com sombra de 1px — legível sobre qualquer fundo. */
export function drawTextShadow(ctx, str, x, y, color = 3, shadow = 0, align = 'left') {
  drawText(ctx, str, x + 1, y + 1, shadow, align);
  drawText(ctx, str, x, y, color, align);
}

/** Quebra o texto em linhas que caibam em maxW pixels. */
export function wrapText(str, maxW) {
  const maxChars = Math.max(1, Math.floor((maxW + 1) / ADVANCE));
  const out = [];
  for (const para of String(str).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const test = line ? `${line} ${word}` : word;
      if (test.length <= maxChars) { line = test; }
      else { if (line) out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}
