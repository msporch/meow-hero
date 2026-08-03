// Pipeline de arte da v2 (Game Boy Advance).
//
// A v1 quantizava tudo para 4 tons de verde e empurrava os personagens para a
// metade escura da paleta, porque com 4 cores o contraste tinha de ser
// fabricado. Em cor nada disso vale: o trabalho aqui é o oposto — REDUZIR o
// ruído do gerador a uma paleta enxuta de sprite de GBA, sem inventar cor.
//
// O que este arquivo faz:
//   1. reduz cada sprite a no máximo 16 cores (o limite de uma paleta de
//      sprite no GBA de verdade), por corte mediano;
//   2. corta o alfa em binário — pixel meio-transparente vira halo no jogo;
//   3. recorta pela caixa unida entre os frames, para o sprite não tremer;
//   4. mede o contraste contra o céu do jogo e AVISA quando um sprite corre o
//      risco de sumir, em vez de escurecê-lo à força.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const RAW = path.join(ROOT, 'assets', '_v2raw');
const OUT = path.join(ROOT, 'assets', '_gba');

const ALPHA_CUT = 128;
export const MAX_CORES_SPRITE = 16;

/** Cor média do céu do jogo, para medir contraste do primeiro plano. */
const CEU = [168, 196, 224];

const read = f => PNG.sync.read(fs.readFileSync(f));
const write = (p, png) => fs.writeFileSync(p, PNG.sync.write(png, { colorType: 6 }));
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Corte mediano: reduz a N cores partindo a caixa de cor pelo eixo mais
 * espalhado, repetidamente. Preserva as cores de identidade do personagem —
 * ao contrário de mapear tudo para uma paleta fixa, que apagaria o vermelho do
 * bombeiro ou o dourado do robô.
 */
function corteMediano(pixels, n) {
  let caixas = [pixels];
  while (caixas.length < n) {
    // Divide a caixa com maior amplitude de cor.
    let alvo = -1, maiorAmplitude = -1;
    caixas.forEach((cx, i) => {
      if (cx.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of cx) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        if (hi - lo > maiorAmplitude) { maiorAmplitude = hi - lo; alvo = i; }
      }
    });
    if (alvo < 0 || maiorAmplitude <= 0) break;

    const cx = caixas[alvo];
    let eixo = 0, melhor = -1;
    for (let c = 0; c < 3; c++) {
      let lo = 255, hi = 0;
      for (const p of cx) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
      if (hi - lo > melhor) { melhor = hi - lo; eixo = c; }
    }
    cx.sort((a, b) => a[eixo] - b[eixo]);
    const meio = cx.length >> 1;
    caixas.splice(alvo, 1, cx.slice(0, meio), cx.slice(meio));
  }

  return caixas.filter(c => c.length).map(cx => {
    const s = [0, 0, 0];
    for (const p of cx) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; }
    return s.map(v => Math.round(v / cx.length));
  });
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Reduz um conjunto de frames a uma paleta comum de no máximo `n` cores. */
export function reduzPaleta(pngs, n = MAX_CORES_SPRITE) {
  const amostra = [];
  for (const p of pngs) {
    for (let i = 0; i < p.data.length; i += 4) {
      if (p.data[i + 3] >= ALPHA_CUT) amostra.push([p.data[i], p.data[i + 1], p.data[i + 2]]);
    }
  }
  if (!amostra.length) return { pngs, paleta: [] };

  const paleta = corteMediano(amostra.map(c => c.slice()), n);

  for (const p of pngs) {
    for (let i = 0; i < p.data.length; i += 4) {
      // Alfa binário: nada de meio-transparente, que vira halo no jogo.
      if (p.data[i + 3] < ALPHA_CUT) {
        p.data[i] = p.data[i + 1] = p.data[i + 2] = p.data[i + 3] = 0;
        continue;
      }
      p.data[i + 3] = 255;
      const atual = [p.data[i], p.data[i + 1], p.data[i + 2]];
      let melhor = paleta[0], d = Infinity;
      for (const c of paleta) {
        const dd = dist2(atual, c);
        if (dd < d) { d = dd; melhor = c; }
      }
      p.data[i] = melhor[0]; p.data[i + 1] = melhor[1]; p.data[i + 2] = melhor[2];
    }
  }
  return { pngs, paleta };
}

/** Caixa delimitadora unida entre frames — sem ela a animação treme. */
export function caixaUnida(pngs) {
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

export function recorta(src, box) {
  const out = new PNG({ width: box.w, height: box.h });
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const s = ((y + box.y) * src.width + (x + box.x)) * 4, d = (y * box.w + x) * 4;
      out.data[d] = src.data[s]; out.data[d + 1] = src.data[s + 1];
      out.data[d + 2] = src.data[s + 2]; out.data[d + 3] = src.data[s + 3];
    }
  }
  return out;
}

/** Junta frames num strip horizontal. */
export function strip(frames) {
  const fw = frames[0].width, fh = frames[0].height;
  const out = new PNG({ width: fw * frames.length, height: fh });
  frames.forEach((f, n) => {
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const s = (y * fw + x) * 4, d = (y * out.width + n * fw + x) * 4;
        out.data[d] = f.data[s]; out.data[d + 1] = f.data[s + 1];
        out.data[d + 2] = f.data[s + 2]; out.data[d + 3] = f.data[s + 3];
      }
    }
  });
  return out;
}

/**
 * Contraste médio contra o céu do jogo.
 *
 * Não corrige nada: só avisa. Em cor, escurecer à força estragaria a
 * identidade (um astronauta branco tem de ser branco) — a solução certa,
 * quando o aviso dispara, é o cenário ceder, não o personagem.
 */
export function contrasteContraCeu(pngs) {
  let soma = 0, n = 0;
  for (const p of pngs) {
    for (let i = 0; i < p.data.length; i += 4) {
      if (p.data[i + 3] < ALPHA_CUT) continue;
      soma += Math.abs(lum(p.data[i], p.data[i + 1], p.data[i + 2]) - lum(...CEU));
      n++;
    }
  }
  return n ? soma / n : 0;
}

/**
 * A nuvem é quase branca e pouco colorida. Serve de critério porque nenhum
 * prédio destas camadas chega perto: o mais claro é um lilás de canal mínimo
 * 145, e a nuvem mais escura tem 218.
 */
const ehNuvem = (r, g, b) =>
  Math.min(r, g, b) >= 200 && Math.max(r, g, b) - Math.min(r, g, b) <= 45;

/**
 * Remove o céu que o gerador desenhou nas camadas de parallax.
 *
 * Em 4 tons dava para procurar "o tom mais claro". Em cor não existe UMA cor de
 * céu: o gerador desenha um degradê que vai do azul forte no topo a uma bruma
 * quase branca no horizonte. Um limiar fixo contra a cor do topo ou para cedo
 * (sobra uma faixa de bruma atrás dos telhados) ou vai longe demais e come um
 * prédio claro.
 *
 * Por isso são dois limites. O LOCAL compara com o vizinho de onde o
 * preenchimento veio: degradê anda de pouco em pouco, telhado é um salto. O
 * GLOBAL impede que mil passos pequenos levem o preenchimento a qualquer cor.
 * E, como sempre, só o que está CONECTADO à borda de cima some — uma janela
 * azul no meio de um prédio continua lá.
 *
 * Nuvem entra por fora dessa regra. Não por estilo: ela é opaca e barra o
 * preenchimento, e o céu que fica embaixo dela sobrevive em faixas.
 */
export function tiraCeu(png, tolLocal = 24, tolGlobal = 110) {
  const { width: w, height: h } = png;
  const at = (x, y) => (y * w + x) * 4;

  // Cor de referência: média das duas primeiras linhas.
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < Math.min(2, h); y++) {
    for (let x = 0; x < w; x++) {
      const i = at(x, y);
      r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++;
    }
  }
  const ref = [r / n, g / n, b / n];
  const local2 = tolLocal * tolLocal, global2 = tolGlobal * tolGlobal;

  // Cada item da pilha carrega a cor de onde veio, para o teste local.
  const pilha = [];
  for (let x = 0; x < w; x++) pilha.push([x, 0, ref]);
  const visto = new Uint8Array(w * h);

  while (pilha.length) {
    const [x, y, de] = pilha.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    if (visto[y * w + x]) continue;
    const i = at(x, y);
    if (png.data[i + 3] < ALPHA_CUT) { visto[y * w + x] = 1; continue; }
    const c = [png.data[i], png.data[i + 1], png.data[i + 2]];
    const passa = ehNuvem(...c) || (dist2(c, de) <= local2 && dist2(c, ref) <= global2);
    if (!passa) continue;
    visto[y * w + x] = 1;
    png.data[i + 3] = 0;
    pilha.push([x + 1, y, c], [x - 1, y, c], [x, y + 1, c], [x, y - 1, c]);
  }
  return png;
}

/**
 * Mantém só o que está ligado à base da imagem.
 *
 * Depois de tirar o céu sobram as nuvens: elas não são da cor do céu, então o
 * preenchimento não as alcança, e chegariam ao jogo como manchas brancas
 * flutuando — e rolando na velocidade dos prédios, que é errado para nuvem.
 * Prédio e chão encostam na última linha; nuvem não. É esse o critério.
 */
export function soAterrado(png) {
  const { width: w, height: h } = png;
  const visto = new Uint8Array(w * h);
  const pilha = [];
  for (let x = 0; x < w; x++) {
    if (png.data[((h - 1) * w + x) * 4 + 3] >= ALPHA_CUT) pilha.push(x, h - 1);
  }
  while (pilha.length) {
    const y = pilha.pop(), x = pilha.pop();
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    if (visto[y * w + x]) continue;
    if (png.data[(y * w + x) * 4 + 3] < ALPHA_CUT) continue;
    visto[y * w + x] = 1;
    pilha.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  for (let i = 0, p = 0; i < png.data.length; i += 4, p++) {
    if (!visto[p]) { png.data[i] = png.data[i + 1] = png.data[i + 2] = png.data[i + 3] = 0; }
  }
  return png;
}

/**
 * Corta a faixa de rua chapada que o gerador desenha embaixo das camadas.
 *
 * O critério não pode ser "linha totalmente opaca": numa fileira de prédios as
 * linhas do térreo também são, e cortá-las decepa os prédios pela metade. A
 * rua se distingue por ser LISA — poucas cores por linha. Porta e janela
 * quebram isso. Teto de 25% da altura, por garantia.
 */
export function cortaBaseSolida(png, maxCores = 3) {
  const { width: w, height: h } = png;
  const limite = Math.floor(h * 0.25);
  let corte = 0;
  for (let y = h - 1; y >= h - limite; y--) {
    const cores = new Set();
    let cheia = true;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (png.data[i + 3] < ALPHA_CUT) { cheia = false; break; }
      cores.add((png.data[i] >> 4) * 256 + (png.data[i + 1] >> 4) * 16 + (png.data[i + 2] >> 4));
    }
    if (!cheia || cores.size > maxCores) break;
    corte++;
  }
  if (!corte) return png;
  return recorta(png, { x: 0, y: 0, w, h: h - corte });
}

/**
 * Encolhe por divisor inteiro, escolhendo a cor dominante de cada bloco.
 *
 * Média borraria: pixel art não tem meio-tom entre duas cores da paleta. Bloco
 * com menos de 40% de cobertura vira transparente — abaixo disso um poste fino
 * desaparece em vez de afinar.
 */
export function encolhe(src, d) {
  if (d <= 1) return src;
  const w = Math.max(1, Math.floor(src.width / d));
  const h = Math.max(1, Math.floor(src.height / d));
  const out = new PNG({ width: w, height: h });

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const conta = new Map();
      let opacos = 0, total = 0;
      for (let by = 0; by < d; by++) {
        for (let bx = 0; bx < d; bx++) {
          const sx = x * d + bx, sy = y * d + by;
          if (sx >= src.width || sy >= src.height) continue;
          total++;
          const s = (sy * src.width + sx) * 4;
          if (src.data[s + 3] < ALPHA_CUT) continue;
          opacos++;
          const k = `${src.data[s]},${src.data[s + 1]},${src.data[s + 2]}`;
          conta.set(k, (conta.get(k) || 0) + 1);
        }
      }
      const d0 = (y * w + x) * 4;
      if (!opacos || opacos < total * 0.4) {
        out.data[d0] = out.data[d0 + 1] = out.data[d0 + 2] = out.data[d0 + 3] = 0;
        continue;
      }
      // Empate vai para a cor mais escura: é o que preserva o contorno.
      let melhor = null, n = -1;
      for (const [k, v] of conta) {
        if (v > n) { n = v; melhor = k; continue; }
        if (v === n && melhor) {
          const a = k.split(',').map(Number), b = melhor.split(',').map(Number);
          if (lum(...a) < lum(...b)) melhor = k;
        }
      }
      const [r, g, b] = melhor.split(',').map(Number);
      out.data[d0] = r; out.data[d0 + 1] = g; out.data[d0 + 2] = b; out.data[d0 + 3] = 255;
    }
  }
  return out;
}

/**
 * Altura que cada prop deve ter NA TELA, em pixels de jogo.
 *
 * O gerador desenha cada objeto preenchendo a própria tela, então a escala
 * relativa entre eles nasce sem sentido: a moeda sai do mesmo tamanho do
 * poste. Estes números vêm do herói (~56 px ≈ 1,75 m, logo ~32 px por metro) e
 * são o que dá noção de tamanho ao cenário.
 */
export const ALTURA_ALVO = {
  coin: 14, milk: 15, trash_bin: 22, cone: 13, box: 18,
  hydrant: 20, sign: 30, streetlight: 58, bush: 16,
};

/** Divisor inteiro que mais aproxima a altura do alvo. */
export function divisorPara(altura, alvo) {
  if (!alvo) return 1;
  let melhor = 1, erro = Infinity;
  for (let d = 1; d <= 5; d++) {
    const e = Math.abs(Math.floor(altura / d) - alvo);
    if (e < erro) { erro = e; melhor = d; }
  }
  return melhor;
}

// ---------- execução ----------
if (process.argv[1]?.endsWith('demake-gba.mjs')) {
  fs.mkdirSync(path.join(OUT, 'sprites'), { recursive: true });
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  const atlas = { versao: 'gba', paleta: 'gba-16', sprites: {}, anims: {} };
  const CONTRASTE_MIN = 45;
  const arquivos = fs.readdirSync(RAW);

  // ---------- 1. animações ----------
  const grupos = {};
  for (const f of arquivos) {
    // `<nome>_reprovado_*` é a versão que a inspeção visual recusou; ela fica
    // em disco para comparação, mas não pode entrar no atlas.
    if (f.includes('_reprovado_')) continue;
    const m = f.match(/^(.+)_(\d{2})\.png$/);
    if (m) (grupos[m[1]] ??= []).push({ n: Number(m[2]), f });
  }

  for (const [nome, lista] of Object.entries(grupos)) {
    lista.sort((a, b) => a.n - b.n);
    const pngs = lista.map(e => read(path.join(RAW, e.f)));
    const { paleta } = reduzPaleta(pngs);
    const box = caixaUnida(pngs);
    const frames = pngs.map(p => recorta(p, box));
    const arq = `sprites/${nome}.png`;
    write(path.join(OUT, arq), strip(frames));

    atlas.anims[nome] = {
      file: arq, fw: box.w, fh: box.h, frames: frames.length,
      anchorX: Math.round(box.w / 2), anchorY: box.h,
    };

    const c = contrasteContraCeu(frames);
    const aviso = c < CONTRASTE_MIN ? `  ⚠ contraste baixo (${c.toFixed(0)})` : '';
    console.log(`${nome.padEnd(18)} ${box.w}x${box.h} x${frames.length}  ${paleta.length} cores${aviso}`);
  }

  // ---------- 2. props (alfa, recortados, na escala do jogo) ----------
  for (const f of arquivos.filter(x => x.startsWith('prop_'))) {
    const nome = f.slice(5, -4);
    const p = read(path.join(RAW, f));
    reduzPaleta([p]);
    const cortado = recorta(p, caixaUnida([p]));
    const div = divisorPara(cortado.height, ALTURA_ALVO[nome]);
    const q = encolhe(cortado, div);
    const arq = `sprites/${nome}.png`;
    write(path.join(OUT, arq), q);
    atlas.sprites[nome] = { file: arq, w: q.width, h: q.height, anchorX: Math.round(q.width / 2), anchorY: q.height };
    console.log(`prop ${nome.padEnd(14)} ${q.width}x${q.height}${div > 1 ? `  (÷${div})` : ''}`);
  }

  // ---------- 3. cenas ----------
  // As camadas de parallax perdem o céu e a base sólida — o jogo desenha o céu
  // dele por trás. A arte de título é uma ilustração inteira e fica intacta,
  // com paleta mais larga porque é a única imagem que ocupa a tela toda.
  for (const f of arquivos.filter(x => x.startsWith('cena_'))) {
    const nome = f.slice(5, -4);
    let p = read(path.join(RAW, f));
    const titulo = nome === 'title_art';
    if (!titulo) {
      // O recorte de céu vem ANTES da redução de paleta. Reduzir primeiro
      // achata o degradê do horizonte em degraus, e aí o teste local do
      // preenchimento lê cada degrau como borda e para em cima da bruma. Como
      // bônus, as 24 cores sobram todas para os prédios.
      p = tiraCeu(p);
      p = soAterrado(p);
      p = cortaBaseSolida(p);
      const box = caixaUnida([p]);
      p = recorta(p, { x: 0, y: box.y, w: p.width, h: box.h });
    }
    reduzPaleta([p], titulo ? 48 : 24);
    const arq = `sprites/${nome}.png`;
    write(path.join(OUT, arq), p);
    atlas.sprites[nome] = { file: arq, w: p.width, h: p.height, anchorX: 0, anchorY: 0 };
    console.log(`cena ${nome.padEnd(14)} ${p.width}x${p.height}`);
  }

  // ---------- 4. tileset e faixa de chão ----------
  const tsSrc = path.join(RAW, 'tileset_road.png');
  if (fs.existsSync(tsSrc)) {
    const ts = read(tsSrc);
    reduzPaleta([ts], 24);
    write(path.join(OUT, 'sprites/tileset_road.png'), ts);
    atlas.sprites.tileset_road = {
      file: 'sprites/tileset_road.png', w: ts.width, h: ts.height,
      tile: 16, cols: ts.width / 16, anchorX: 0, anchorY: 0,
    };
    console.log(`tile tileset_road  ${ts.width}x${ts.height}`);

    // Faixa pronta: calçada no topo, asfalto repetido embaixo. O jogo só
    // precisa repetir isto na horizontal.
    const T = 16, ALTURA = 28, COLS = ts.width / T;
    const tileEm = n => ({ tx: (n % COLS) * T, ty: Math.floor(n / COLS) * T });
    const SUP = tileEm(3), CORPO = tileEm(COLS + 2);
    const px = (img, sx, sy) => {
      const i = (sy * img.width + sx) * 4;
      return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
    };

    // A banda opaca do tile de superfície não começa necessariamente em y=0.
    let pula = 0;
    for (let y = 0; y < T; y++) {
      let opaco = false;
      for (let x = 0; x < T; x++) if (px(ts, SUP.tx + x, SUP.ty + y)[3] >= ALPHA_CUT) { opaco = true; break; }
      if (opaco) { pula = y; break; }
    }

    const chao = new PNG({ width: T, height: ALTURA });
    for (let y = 0; y < ALTURA; y++) {
      for (let x = 0; x < T; x++) {
        let [r, g, b] = px(ts, CORPO.tx + x, CORPO.ty + (y % T));
        if (y < T - pula) {
          const s = px(ts, SUP.tx + x, SUP.ty + y + pula);
          if (s[3] >= ALPHA_CUT) { r = s[0]; g = s[1]; b = s[2]; }
        }
        const d = (y * T + x) * 4;
        chao.data[d] = r; chao.data[d + 1] = g; chao.data[d + 2] = b; chao.data[d + 3] = 255;
      }
    }
    write(path.join(OUT, 'sprites/ground.png'), chao);
    atlas.sprites.ground = { file: 'sprites/ground.png', w: T, h: ALTURA, anchorX: 0, anchorY: 0 };
    console.log(`chao ground        ${T}x${ALTURA}`);
  }

  // ---------- 5. ícones do PWA ----------
  // Não há mais gato: o ícone é o herói, o mesmo que aparece na tela de título.
  function icone(tam) {
    const png = new PNG({ width: tam, height: tam });
    const FUNDO = [58, 52, 104], BORDA = [18, 20, 28];   // índigo da carcaça
    for (let y = 0; y < tam; y++) {
      for (let x = 0; x < tam; x++) {
        const i = (y * tam + x) * 4;
        const borda = x < tam * 0.06 || y < tam * 0.06 || x > tam * 0.94 || y > tam * 0.94;
        const [r, g, b] = borda ? BORDA : FUNDO;
        png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
      }
    }
    const heroi = path.join(RAW, 'hero_run_02.png');
    if (fs.existsSync(heroi)) {
      const h = read(heroi);
      reduzPaleta([h]);
      const c = recorta(h, caixaUnida([h]));
      const esc = Math.max(1, Math.floor((tam * 0.66) / Math.max(c.width, c.height)));
      const ox = Math.round((tam - c.width * esc) / 2), oy = Math.round((tam - c.height * esc) / 2);
      for (let y = 0; y < c.height * esc; y++) {
        for (let x = 0; x < c.width * esc; x++) {
          const s = (((y / esc) | 0) * c.width + ((x / esc) | 0)) * 4;
          if (c.data[s + 3] < ALPHA_CUT) continue;
          const pxx = ox + x, pyy = oy + y;
          if (pxx < 0 || pyy < 0 || pxx >= tam || pyy >= tam) continue;
          const d = (pyy * tam + pxx) * 4;
          png.data[d] = c.data[s]; png.data[d + 1] = c.data[s + 1]; png.data[d + 2] = c.data[s + 2];
        }
      }
    }
    write(path.join(OUT, `icons/icon-${tam}.png`), png);
    console.log(`icone ${tam}x${tam}`);
  }
  icone(192);
  icone(512);

  fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(atlas, null, 2));
  console.log(`\n${Object.keys(atlas.anims).length} animacoes, ${Object.keys(atlas.sprites).length} sprites → assets/_gba/atlas.json`);
}
