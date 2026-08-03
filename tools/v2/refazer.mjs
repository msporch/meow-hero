// Refaz skins específicas que a inspeção visual reprovou.
//
//   node tools/v2/refazer.mjs fantasma pirata
//   node tools/v2/refazer.mjs            (refaz todas as listadas em REFAZER)
//
// A métrica não pega "esse ficou estranho": um fantasma que virou uma mancha
// branca com botas passa em contagem de frames, alfa e contraste. Quem reprova
// é o olho, na folha de contato — e é daí que sai a lista abaixo.
//
// O id antigo é guardado em `<nome>_reprovado` no pilot.json. Nada é apagado no
// servidor: se a nova versão sair pior, dá para voltar.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, isRateLimited } from '../pl.mjs';
import { ESTILO, ANIMS, CRIATURAS } from './config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const ESTADO = path.join(HERE, 'pilot.json');
const RAW = path.join(ROOT, 'assets', '_v2raw');

const MAX_TENTATIVAS = 3;
const ESPERA_MS = 15000;

/**
 * O que foi reprovado e por quê.
 *
 * `veste` vira `create_character_state` a partir do herói base — mantém corpo,
 * rosto e proporção. `criatura` vira `create_character`, para quem não é uma
 * pessoa fantasiada.
 */
export const REFAZER = {
  // Saiu uma massa branca sem forma, com botas pretas embaixo. Vira estado do
  // herói: a silhueta legível do corredor com identidade de fantasma por cima.
  fantasma: {
    tipo: 'veste',
    desc: 'as a ghost, pale bluish-white translucent skin, hollow black eye sockets, wearing a tattered flowing white sheet cloak with ragged edges',
  },
  // Duas tentativas descrevendo o traje inteiro voltaram quase iguais: num
  // sprite de 56px o tricórnio marrom se funde ao cabelo e o tapa-olho não tem
  // pixel. Esta descreve pela SILHUETA e pelo contraste, que é o que sobrevive
  // nesse tamanho: chapéu preto largo contra casaco vermelho.
  pirata: {
    tipo: 'veste',
    desc: 'wearing a huge wide black pirate hat and a bright red coat, with a black patch over one eye',
  },
  // Lia como "menino de mochila verde". Sem faixa refletiva, sem neon.
  neon: {
    tipo: 'veste',
    desc: 'wearing a bright lime green and hot pink windbreaker jacket with wide reflective silver stripes across the chest and sleeves, and a matching cap',
  },
  // Skin mais cara do jogo e a mais sem graça: um boneco dourado chapado.
  // Duas descrições longas seguidas voltaram com status failed do servidor.
  // Esta é curta de propósito: o que precisa ler é coroa, viseira e ouro.
  robo_ouro: {
    tipo: 'criatura',
    desc: 'golden robot wearing a crown, with a glowing cyan visor',
  },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ler = () => JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
const gravar = m => fs.writeFileSync(ESTADO, JSON.stringify(m, null, 2));
const idDe = t => (t.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];

async function insistir(tool, args, rotulo) {
  for (let i = 0; i < 30; i++) {
    let out;
    try { out = await call(tool, args); } catch (e) { out = e.message; }
    if (isRateLimited(out)) { await sleep(ESPERA_MS); continue; }
    return out;
  }
  console.log(`  ! ${rotulo}: fila nao abriu`);
  return '';
}

async function detalhe(id) {
  if (!id) return { st: 'ausente', anims: new Set() };
  let t;
  try { t = await call('get_character', { character_id: id, include_preview: false }); }
  catch { return { st: 'processando', anims: new Set() }; }
  if (/status:\s*failed/.test(t)) return { st: 'falhou', anims: new Set() };
  if (!/status:\s*completed/.test(t)) return { st: 'processando', anims: new Set() };
  const anims = new Set();
  for (const linha of t.split('\n')) {
    const m = linha.match(/^ {2}(\S+)\s+[—-]\s+/);
    if (m) anims.add(m[1]);
  }
  return { st: 'pronto', anims };
}

async function aguardar(id) {
  let d = await detalhe(id);
  while (d.st === 'processando') { await sleep(ESPERA_MS); d = await detalhe(id); }
  return d;
}

const pedidos = process.argv.slice(2);
const lista = (pedidos.length ? pedidos : Object.keys(REFAZER))
  .filter(k => { if (REFAZER[k]) return true; console.log(`? ${k} nao esta em REFAZER`); return false; });

if (!lista.length) { console.log('nada a refazer'); process.exit(0); }
console.log(`refazendo: ${lista.join(', ')}\n`);

const base = ler().ids.base;

for (const chave of lista) {
  const { tipo, desc } = REFAZER[chave];
  const m = ler();

  // Guarda o reprovado antes de sobrescrever, e limpa os frames antigos —
  // baixar.mjs pula arquivo existente e devolveria a versão velha.
  if (m.ids[chave] && !m.ids[`${chave}_reprovado`]) {
    m.ids[`${chave}_reprovado`] = m.ids[chave];
    gravar(m);
  }
  for (const f of fs.readdirSync(RAW)) {
    if (new RegExp(`^${chave}_(run|idle|pose)_\\d\\d\\.png$`).test(f)) fs.unlinkSync(path.join(RAW, f));
  }

  let novo = null;
  for (let n = 1; n <= MAX_TENTATIVAS; n++) {
    const out = tipo === 'veste'
      ? await insistir('create_character_state', {
          character_id: base, edit_description: desc, state_name: chave,
        }, chave)
      : await insistir('create_character', {
          ...ESTILO, description: desc, name: `Meow v2 ${chave}`,
        }, chave);

    const id = idDe(out);
    if (id) { novo = id; break; }
    console.log(`✗ ${chave} (${n}/${MAX_TENTATIVAS}): ${String(out).slice(0, 90)}`);
    await sleep(ESPERA_MS);
  }
  if (!novo) { console.log(`✗ ${chave}: DESISTI`); continue; }

  const mm = ler(); mm.ids[chave] = novo; gravar(mm);
  console.log(`+ ${chave} → ${novo}`);

  const d = await aguardar(novo);
  if (d.st !== 'pronto') { console.log(`! ${chave} nao ficou pronto (${d.st})`); continue; }

  const anims = CRIATURAS[chave]?.quad ? ANIMS.quadrupede : ANIMS.bipede;
  for (const a of anims) {
    const nome = `${chave}_${a.key}`;
    if (d.anims.has(nome)) { console.log(`· ${nome} ja existe`); continue; }
    const out = await insistir('animate_character', {
      character_id: novo, template_animation_id: a.tpl,
      animation_name: nome, directions: ['east'],
    }, nome);
    console.log(out && !/error/i.test(out) ? `+ ${nome}` : `! ${nome}`);
    await sleep(3000);
  }
}

console.log('\npronto. rode: node tools/v2/baixar.mjs && node tools/v2/qa.mjs');
