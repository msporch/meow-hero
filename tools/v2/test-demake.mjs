// Testes do pipeline de arte da v2.
//
// Estas funções mexem em pixel e falham em silêncio: um `tiraCeu` cedo demais
// apaga o prédio junto com o céu, um `cortaBaseSolida` guloso come metade da
// camada, e o erro só aparece na tela do jogo — depois de já ter gasto as
// gerações. Aqui cada uma é conferida com uma imagem construída à mão.
import { PNG } from 'pngjs';
import {
  reduzPaleta, caixaUnida, recorta, strip, tiraCeu, cortaBaseSolida,
  contrasteContraCeu, soAterrado, encolhe, divisorPara,
} from './demake-gba.mjs';

let ok = 0, falhou = 0;
const t = (nome, f) => {
  try { f(); console.log(`  ok   ${nome}`); ok++; }
  catch (e) { console.log(`  FALHOU ${nome}\n         ${e.message}`); falhou++; }
};
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${a} ≠ ${b}`); };
const verdade = (v, m) => { if (!v) throw new Error(m); };

/** Cria um PNG e pinta com uma função (x,y) → [r,g,b,a]. */
function png(w, h, f) {
  const p = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = f(x, y);
      const i = (y * w + x) * 4;
      p.data[i] = r; p.data[i + 1] = g; p.data[i + 2] = b; p.data[i + 3] = a;
    }
  }
  return p;
}
const em = (p, x, y) => {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
};
const cores = p => {
  const s = new Set();
  for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3] >= 128) s.add(`${p.data[i]},${p.data[i + 1]},${p.data[i + 2]}`);
  return s;
};

console.log('— redução de paleta —');

t('reduz a no máximo N cores', () => {
  // Degradê de 64 tons distintos.
  const p = png(8, 8, (x, y) => [x * 32, y * 32, (x + y) * 16, 255]);
  reduzPaleta([p], 8);
  verdade(cores(p).size <= 8, `sobraram ${cores(p).size} cores`);
});

t('não inventa cor fora da faixa original', () => {
  const p = png(4, 4, () => [200, 30, 30, 255]);
  reduzPaleta([p], 8);
  const [r, g, b] = em(p, 0, 0);
  eq(r, 200, 'vermelho'); eq(g, 30, 'verde'); eq(b, 30, 'azul');
});

t('alfa vira binário — nada de meio-transparente', () => {
  const p = png(4, 4, (x) => [100, 100, 100, x === 0 ? 60 : x === 1 ? 200 : 255]);
  reduzPaleta([p]);
  eq(em(p, 0, 0)[3], 0, 'alfa 60 deveria sumir');
  eq(em(p, 1, 0)[3], 255, 'alfa 200 deveria firmar');
  eq(em(p, 3, 0)[3], 255, 'alfa 255');
});

t('paleta é comum a todos os frames', () => {
  const a = png(4, 4, () => [10, 200, 10, 255]);
  const b = png(4, 4, () => [200, 10, 10, 255]);
  reduzPaleta([a, b], 4);
  const juntas = new Set([...cores(a), ...cores(b)]);
  verdade(juntas.size <= 4, `${juntas.size} cores entre os dois frames`);
});

console.log('\n— caixa e recorte —');

t('caixa unida cobre todos os frames', () => {
  // Frame 1 ocupa a esquerda, frame 2 a direita: a caixa tem de pegar os dois.
  const a = png(10, 10, (x, y) => [0, 0, 0, x === 2 && y === 3 ? 255 : 0]);
  const b = png(10, 10, (x, y) => [0, 0, 0, x === 7 && y === 8 ? 255 : 0]);
  const c = caixaUnida([a, b]);
  eq(c.x, 2, 'x'); eq(c.y, 3, 'y'); eq(c.w, 6, 'largura'); eq(c.h, 6, 'altura');
});

t('quadro totalmente vazio devolve a imagem inteira', () => {
  const a = png(6, 6, () => [0, 0, 0, 0]);
  const c = caixaUnida([a]);
  eq(c.w, 6, 'largura'); eq(c.h, 6, 'altura');
});

t('recorte preserva o conteúdo', () => {
  const a = png(10, 10, (x, y) => (x === 4 && y === 5 ? [9, 8, 7, 255] : [0, 0, 0, 0]));
  const c = recorta(a, { x: 4, y: 5, w: 1, h: 1 });
  eq(c.width, 1, 'largura');
  eq(em(c, 0, 0).join(','), '9,8,7,255', 'pixel');
});

t('strip põe os frames lado a lado na ordem', () => {
  const f = n => png(3, 3, () => [n, 0, 0, 255]);
  const s = strip([f(10), f(20), f(30)]);
  eq(s.width, 9, 'largura');
  eq(em(s, 0, 0)[0], 10, 'frame 0');
  eq(em(s, 3, 0)[0], 20, 'frame 1');
  eq(em(s, 6, 0)[0], 30, 'frame 2');
});

console.log('\n— recorte de céu —');

t('céu conectado à borda de cima some', () => {
  // Metade de cima é céu; metade de baixo é prédio.
  const p = png(8, 8, (x, y) => (y < 4 ? [168, 196, 224, 255] : [80, 60, 40, 255]));
  tiraCeu(p);
  eq(em(p, 0, 0)[3], 0, 'topo deveria sumir');
  eq(em(p, 0, 7)[3], 255, 'prédio deveria ficar');
});

t('janela da mesma cor no meio do prédio NÃO some', () => {
  // Uma janela azul-céu cercada de parede: não encosta na borda, então fica.
  const p = png(8, 8, (x, y) => {
    if (y < 2) return [168, 196, 224, 255];              // céu
    if (x === 4 && y === 5) return [168, 196, 224, 255]; // janela
    return [80, 60, 40, 255];
  });
  tiraCeu(p);
  eq(em(p, 0, 0)[3], 0, 'céu deveria sumir');
  eq(em(p, 4, 5)[3], 255, 'janela deveria ficar');
});

t('tolera degradê suave dentro da tolerância', () => {
  // Céu que escurece 3 níveis por linha — ainda é o mesmo céu.
  const p = png(8, 12, (x, y) => (y < 8 ? [168, 196 - y * 3, 224 - y * 3, 255] : [30, 30, 30, 255]));
  tiraCeu(p);
  eq(em(p, 0, 7)[3], 0, 'última linha de céu deveria sumir');
  eq(em(p, 0, 8)[3], 255, 'chão deveria ficar');
});

t('não come um prédio de cor bem diferente', () => {
  const p = png(8, 8, (x, y) => (y < 2 ? [168, 196, 224, 255] : [200, 40, 40, 255]));
  tiraCeu(p);
  eq(em(p, 3, 4)[3], 255, 'prédio vermelho deveria ficar');
});

console.log('\n— só o que encosta no chão —');

t('nuvem solta some, prédio fica', () => {
  // Nuvem em (1,1) sem contato; coluna de prédio em x=5 até a base.
  const p = png(8, 8, (x, y) => {
    if (x === 1 && y === 1) return [255, 255, 255, 255];
    if (x === 5 && y >= 3) return [80, 60, 40, 255];
    return [0, 0, 0, 0];
  });
  soAterrado(p);
  eq(em(p, 1, 1)[3], 0, 'nuvem deveria sumir');
  eq(em(p, 5, 3)[3], 255, 'topo do prédio deveria ficar');
  eq(em(p, 5, 7)[3], 255, 'base do prédio deveria ficar');
});

t('mantém o que encosta na base só por diagonal? não — ligação é a 4', () => {
  // (2,6) toca a base só na diagonal via (3,7): não conta.
  const p = png(8, 8, (x, y) => ((x === 2 && y === 6) || (x === 3 && y === 7) ? [10, 10, 10, 255] : [0, 0, 0, 0]));
  soAterrado(p);
  eq(em(p, 3, 7)[3], 255, 'o que está na base fica');
  eq(em(p, 2, 6)[3], 0, 'ligação diagonal não conta');
});

console.log('\n— faixa de rua —');

t('corta a rua lisa embaixo', () => {
  // 12 linhas de prédio com janelas + 3 linhas de asfalto chapado.
  const p = png(8, 15, (x, y) => (y >= 12 ? [90, 90, 90, 255]
    : x % 3 === 0 ? [200, 200, 60, 255] : [140, 40, 40, 255]));
  eq(cortaBaseSolida(p).height, 12, 'altura depois do corte');
});

t('NÃO corta o térreo do prédio, que também é opaco', () => {
  // Tudo opaco, mas cada linha tem parede, porta, moldura e sombra. Medido no
  // bg_city de verdade: a rua tem 1 cor por linha, o térreo tem 40+.
  const paleta = [[140, 40, 40], [200, 200, 60], [90, 60, 30], [40, 40, 70], [220, 180, 120]];
  const p = png(8, 12, (x, y) => [...paleta[(x + y) % paleta.length], 255]);
  eq(cortaBaseSolida(p).height, 12, 'não deveria cortar nada');
});

t('não corta quando a base tem buraco', () => {
  const p = png(8, 12, (x, y) => [0, 0, 0, x % 2 ? 255 : 0]);
  eq(cortaBaseSolida(p).height, 12, 'altura');
});

t('nunca come mais de 25% da altura', () => {
  const p = png(8, 20, () => [50, 50, 50, 255]);
  verdade(cortaBaseSolida(p).height >= 15, 'teto de 25%');
});

console.log('\n— escala dos props —');

t('divisor aproxima a altura do alvo', () => {
  eq(divisorPara(46, 14), 3, 'moeda 46→14');
  eq(divisorPara(91, 58), 2, 'poste 91→58');
  eq(divisorPara(28, 15), 2, 'leite 28→15');
  eq(divisorPara(20, 20), 1, 'já no alvo');
});

t('sem alvo definido, não encolhe', () => eq(divisorPara(46, undefined), 1, 'divisor'));

t('encolher escolhe a cor dominante do bloco', () => {
  // Bloco 2×2 com 3 pixels vermelhos e 1 azul → vermelho.
  const p = png(2, 2, (x, y) => (x === 1 && y === 1 ? [0, 0, 200, 255] : [200, 0, 0, 255]));
  const q = encolhe(p, 2);
  eq(q.width, 1, 'largura');
  eq(em(q, 0, 0).slice(0, 3).join(','), '200,0,0', 'cor dominante');
});

t('bloco com pouca cobertura vira transparente', () => {
  // 1 de 4 pixels opaco = 25% < 40%.
  const p = png(2, 2, (x, y) => (x === 0 && y === 0 ? [10, 10, 10, 255] : [0, 0, 0, 0]));
  eq(em(encolhe(p, 2), 0, 0)[3], 0, 'deveria sumir');
});

t('poste fino sobrevive ao encolhimento', () => {
  // Coluna de 2px de largura num sprite de 4: metade do bloco, acima de 40%.
  const p = png(4, 8, (x) => (x === 1 || x === 2 ? [30, 30, 30, 255] : [0, 0, 0, 0]));
  const q = encolhe(p, 2);
  const opacos = [...Array(q.height).keys()].filter(y => em(q, 0, y)[3] === 255 || em(q, 1, y)[3] === 255);
  verdade(opacos.length === q.height, 'o poste deveria continuar inteiro');
});

t('divisor 1 devolve a imagem intacta', () => {
  const p = png(3, 3, () => [1, 2, 3, 255]);
  eq(encolhe(p, 1), p, 'mesma referência');
});

console.log('\n— contraste contra o céu —');

t('sprite escuro tem contraste alto', () => {
  const p = png(4, 4, () => [20, 20, 20, 255]);
  verdade(contrasteContraCeu([p]) > 100, 'preto contra céu claro');
});

t('sprite da cor do céu tem contraste ~zero', () => {
  const p = png(4, 4, () => [168, 196, 224, 255]);
  verdade(contrasteContraCeu([p]) < 2, 'mesma cor do céu');
});

t('pixel transparente não entra na conta', () => {
  const p = png(4, 4, (x) => (x === 0 ? [20, 20, 20, 255] : [255, 255, 255, 0]));
  verdade(contrasteContraCeu([p]) > 100, 'só o pixel opaco conta');
});

console.log(`\n${ok} passaram, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);
