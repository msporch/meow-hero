// Catálogo de skins do herói.
//
// Cada skin é um personagem próprio gerado pelo PixelLab, com as mesmas
// dimensões e âncoras do padrão — trocar de skin é só trocar o prefixo da
// animação, sem mexer no posicionamento da cena.
import * as store from './storage.js';
import { PAY_LINKS } from './payments.js';

export const SKINS = [
  { id: 'padrao',    nome: 'CLASSICO',  anim: 'hero',      coins: 0,
    desc: 'O corredor de sempre.' },
  { id: 'neon',      nome: 'NEON',      anim: 'neon',      coins: 400,
    desc: 'Corta a noite com faixas refletivas.' },
  { id: 'ninja',     nome: 'NINJA',     anim: 'ninja',     coins: 1500,
    desc: 'Silencioso e rapido.' },
  { id: 'robo',      nome: 'ROBO',      anim: 'robo',      coins: 4000,
    desc: 'Nao cansa. Nunca.' },
  { id: 'astro',     nome: 'ASTRO',     anim: 'astro',     brl: 4.90,
    desc: 'Gravidade e so um detalhe.' },
  { id: 'esqueleto', nome: 'ESQUELETO', anim: 'esqueleto', brl: 9.90,
    desc: 'Ossos que nao param.' },
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
