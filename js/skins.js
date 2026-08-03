// Catálogo de skins do herói.
//
// Cada skin é um personagem próprio gerado pelo PixelLab, com as mesmas
// dimensões e âncoras do padrão — trocar de skin é só trocar o prefixo da
// animação, sem mexer no posicionamento da cena.
import * as store from './storage.js';
import { PAY_LINKS } from './payments.js';

/**
 * Ordenadas por preço, das baratas para as caras — é como a loja se lê melhor.
 * Cada skin é um personagem próprio gerado com os mesmos parâmetros do padrão.
 */
export const SKINS = [
  { id: 'padrao',    nome: 'CLASSICO',  anim: 'hero',      coins: 0,
    desc: 'O corredor de sempre.' },
  { id: 'neon',      nome: 'NEON',      anim: 'neon',      coins: 300,
    desc: 'Corta a noite com faixas refletivas.' },
  { id: 'chef',      nome: 'CHEF',      anim: 'chef',      coins: 500,
    desc: 'Corre com a frigideira na mao.' },
  { id: 'bombeiro',  nome: 'BOMBEIRO',  anim: 'bombeiro',  coins: 700,
    desc: 'Sempre com pressa.' },
  { id: 'pirata',    nome: 'PIRATA',    anim: 'pirata',    coins: 900,
    desc: 'Atras do proximo bau.' },
  { id: 'gato',      nome: 'GATO',      anim: 'gato',      coins: 1200,
    desc: 'Sete vidas, uma so meta.' },
  { id: 'cachorro',  nome: 'CACHORRO',  anim: 'cachorro',  coins: 1200,
    desc: 'Melhor parceiro de corrida.' },
  { id: 'ninja',     nome: 'NINJA',     anim: 'ninja',     coins: 1500,
    desc: 'Silencioso e rapido.' },
  { id: 'zumbi',     nome: 'ZUMBI',     anim: 'zumbi',     coins: 1800,
    desc: 'Lento? Nem sempre.' },
  { id: 'panda',     nome: 'PANDA',     anim: 'panda',     coins: 2200,
    desc: 'Fofo e imparavel.' },
  { id: 'mago',      nome: 'MAGO',      anim: 'mago',      coins: 2600,
    desc: 'Corre porque nao sabe teleportar.' },
  { id: 'alien',     nome: 'ALIEN',     anim: 'alien',     coins: 3000,
    desc: 'Veio de longe so pra correr.' },
  { id: 'cavaleiro', nome: 'CAVALEIRO', anim: 'cavaleiro', coins: 3400,
    desc: 'Armadura completa. Coragem tambem.' },
  { id: 'robo',      nome: 'ROBO',      anim: 'robo',      coins: 4000,
    desc: 'Nao cansa. Nunca.' },
  { id: 'vampiro',   nome: 'VAMPIRO',   anim: 'vampiro',   coins: 4500,
    desc: 'Prefere o turno da noite.' },
  { id: 'dino',      nome: 'DINO',      anim: 'dino',      coins: 5500,
    desc: 'Bracinhos curtos, pernas longas.' },
  { id: 'banana',    nome: 'BANANA',    anim: 'banana',    coins: 7000,
    desc: 'Ninguem sabe por que. Funciona.' },
  { id: 'astro',     nome: 'ASTRO',     anim: 'astro',     brl: 4.90,
    desc: 'Gravidade e so um detalhe.' },
  { id: 'fantasma',  nome: 'FANTASMA',  anim: 'fantasma',  brl: 6.90,
    desc: 'Atravessa tudo, menos a meta.' },
  { id: 'esqueleto', nome: 'ESQUELETO', anim: 'esqueleto', brl: 9.90,
    desc: 'Ossos que nao param.' },
  { id: 'robo_ouro', nome: 'ROBO OURO', anim: 'robo_ouro', brl: 14.90,
    desc: 'A versao que ninguem precisava.' },
];

export const skinById = id => SKINS.find(s => s.id === id) ?? SKINS[0];

/** Skins já liberadas. A padrão é sempre uma delas. */
export function owned() {
  const lista = store.get('skinsOwned');
  const set = new Set(Array.isArray(lista) ? lista : []);
  set.add('padrao');
  return set;
}

export function isOwned(id) { return owned().has(id); }

export function equipped() {
  const id = store.get('skin');
  return isOwned(id) ? skinById(id) : SKINS[0];
}

export function equip(id) {
  if (!isOwned(id)) return false;
  store.set('skin', id);
  return true;
}

function grant(id) {
  const set = owned();
  set.add(id);
  store.set('skinsOwned', [...set]);
}

/**
 * Compra com moedas do cofrinho.
 * Devolve 'ok' | 'sem-moedas' | 'ja-tem' | 'nao-e-de-moedas'.
 */
export function buyWithCoins(id) {
  const s = skinById(id);
  if (isOwned(id)) return 'ja-tem';
  if (s.coins == null) return 'nao-e-de-moedas';

  const saldo = store.get('coins') || 0;
  if (saldo < s.coins) return 'sem-moedas';

  store.set('coins', saldo - s.coins);
  grant(id);
  equip(id);
  return 'ok';
}

/**
 * Skins pagas em dinheiro.
 *
 * O jogo NÃO processa pagamento: ele abre o link do provedor que o dono da
 * loja configurar em js/payments.js. A liberação depois do pagamento precisa
 * ser confirmada por fora (ver README) — sem isso o botão fica indisponível,
 * em vez de fingir uma compra que não aconteceu.
 */
export function payLink(id) {
  const url = PAY_LINKS[id];
  return typeof url === 'string' && /^https:\/\//.test(url) ? url : null;
}

/** Libera uma skin paga. Chamado ao confirmar a compra junto ao provedor. */
export function grantPaid(id) {
  const s = skinById(id);
  if (s.brl == null) return false;
  grant(id);
  return true;
}

export function formatPrice(s) {
  if (s.coins === 0) return 'GRATIS';
  if (s.coins != null) return `\x05 ${s.coins}`;
  return `R$ ${s.brl.toFixed(2).replace('.', ',')}`;
}
