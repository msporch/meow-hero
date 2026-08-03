// Produção do elenco v2, em três etapas: roupas → criaturas → animações.
//
// Regras que vêm de erro cometido:
//   - teto de tentativas por personagem (um laço sem teto queimou ~250
//     gerações recriando três skins que o servidor recusava);
//   - lotes pequenos, porque é a saturação da fila que provoca a recusa;
//   - nada é recriado se já existe e está pronto — o script pode ser
//     interrompido e retomado sem custo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, isRateLimited } from '../pl.mjs';
import { VESTES, CRIATURAS, ANIMS, ESTILO, estiloQuadrupede } from './config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ESTADO = path.join(HERE, 'pilot.json');

const MAX_TENTATIVAS = 3;
const ESPERA_MS = 15000;
const LOTE = 2;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ler = () => JSON.parse(fs.readFileSync(ESTADO, 'utf8'));
const gravar = m => fs.writeFileSync(ESTADO, JSON.stringify(m, null, 2));
const idDe = t => (t.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];

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

/** Espera um personagem sair de 'processando'. */
async function aguardar(chave, id) {
  let d = await detalhe(id);
  while (d.st === 'processando') {
    await sleep(ESPERA_MS);
    d = await detalhe(id);
  }
  return d;
}

/** Cria (ou recupera) um personagem, com teto de tentativas. */
async function garantir(chave, tool, args) {
  const m = ler();
  for (let n = 1; n <= MAX_TENTATIVAS; n++) {
    const d = await aguardar(chave, m.ids[chave]);
    if (d.st === 'pronto') return m.ids[chave];

    console.log(`${d.st === 'falhou' ? '✗' : '+'} ${chave} (${n}/${MAX_TENTATIVAS})`);
    const out = await insistir(tool, args, chave);
    const id = idDe(out);
    if (!id) { console.log(`  ! ${chave}: ${String(out).slice(0, 90)}`); await sleep(ESPERA_MS); continue; }
    const mm = ler(); mm.ids[chave] = id; gravar(mm);
    m.ids[chave] = id;
  }
  console.log(`✗ ${chave}: DESISTI apos ${MAX_TENTATIVAS} tentativas`);
  return null;
}

const baseId = ler().ids.base;
console.log(`base: ${baseId}\n`);

// ---------- etapa 1: skins de roupa ----------
console.log('=== roupas ===');
for (const [chave, veste] of Object.entries(VESTES)) {
  if (ler().ids[chave]) {
    const d = await aguardar(chave, ler().ids[chave]);
    if (d.st === 'pronto') { console.log(`· ${chave} ja existe`); continue; }
  }
  await garantir(chave, 'create_character_state', {
    character_id: baseId,
    edit_description: veste,
    state_name: chave,
  });
}

// ---------- etapa 2: criaturas ----------
console.log('\n=== criaturas ===');
const criaturas = Object.entries(CRIATURAS);
for (let i = 0; i < criaturas.length; i += LOTE) {
  for (const [chave, cfg] of criaturas.slice(i, i + LOTE)) {
    if (ler().ids[chave]) {
      const d = await aguardar(chave, ler().ids[chave]);
      if (d.st === 'pronto') { console.log(`· ${chave} ja existe`); continue; }
    }
    const params = cfg.quad
      ? { ...estiloQuadrupede(cfg.quad), description: cfg.description, name: `Meow v2 ${chave}` }
      : { ...ESTILO, description: cfg.description, name: `Meow v2 ${chave}` };
    await garantir(chave, 'create_character', params);
  }
}

// ---------- etapa 3: animações ----------
console.log('\n=== animacoes ===');
const m = ler();
for (const [chave, id] of Object.entries(m.ids)) {
  if (!id) continue;
  // `<nome>_reprovado` guarda o personagem que a inspeção visual recusou.
  // Continuar animando ele gasta geração e cria `<nome>_reprovado_run`, que
  // nenhuma skin usa.
  if (chave.endsWith('_reprovado')) continue;
  const d = await aguardar(chave, id);
  if (d.st !== 'pronto') { console.log(`· ${chave} nao esta pronto, pulando`); continue; }

  const ehQuad = CRIATURAS[chave]?.quad;
  const lista = ehQuad ? ANIMS.quadrupede : ANIMS.bipede;

  for (const a of lista) {
    const nome = `${chave}_${a.key}`;
    if (d.anims.has(nome)) { console.log(`· ${nome} ja existe`); continue; }
    const out = await insistir('animate_character', {
      character_id: id,
      template_animation_id: a.tpl,
      animation_name: nome,
      directions: ['east'],
    }, nome);
    console.log(out && !/error/i.test(out) ? `+ ${nome}` : `! ${nome}`);
    await sleep(3000);
  }
}

console.log('\n--- elenco ---');
for (const [k, v] of Object.entries(ler().ids)) console.log(`${k}: ${v}`);
