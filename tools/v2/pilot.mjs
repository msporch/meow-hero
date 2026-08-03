// Piloto da v2: herói base + 3 skins de roupa, para julgar consistência antes
// de gastar a cota inteira.
//
// As três foram escolhidas para forçar o teste: ninja é todo escuro, chef é
// volumoso e claro, astro tem capacete. Se a identidade do corredor sobreviver
// ao astro, sobrevive a qualquer coisa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, isRateLimited } from '../pl.mjs';
import { BASE, VESTES, ESTILO } from './config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ESTADO = path.join(HERE, 'pilot.json');

const PILOTO = ['ninja', 'chef', 'astro'];
const MAX_TENTATIVAS = 3;
const ESPERA_MS = 15000;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ler = () => (fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, 'utf8')) : { ids: {} });
const gravar = m => fs.writeFileSync(ESTADO, JSON.stringify(m, null, 2));
const idDe = t => (t.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];

async function estado(id) {
  if (!id) return 'ausente';
  try {
    const t = await call('get_character', { character_id: id, include_preview: false });
    if (/status:\s*failed/.test(t)) return 'falhou';
    return /status:\s*completed/.test(t) ? 'pronto' : 'processando';
  } catch { return 'processando'; }
}

/** Insiste enquanto for rate limit; devolve '' se a fila não abrir. */
async function insistir(tool, args, rotulo) {
  for (let i = 0; i < 30; i++) {
    let out;
    try { out = await call(tool, args); } catch (e) { out = e.message; }
    if (isRateLimited(out)) { console.log(`  … ${rotulo}: fila cheia, aguardando`); await sleep(ESPERA_MS); continue; }
    return out;
  }
  return '';
}

/** Cria algo com teto de tentativas — a falha que queimou 250 gerações. */
async function garantir(chave, tool, args) {
  const m = ler();
  for (let n = 1; n <= MAX_TENTATIVAS; n++) {
    let st = await estado(m.ids[chave]);

    while (st === 'processando') {
      console.log(`  … ${chave} processando`);
      await sleep(ESPERA_MS);
      st = await estado(m.ids[chave]);
    }
    if (st === 'pronto') { console.log(`✓ ${chave}`); return m.ids[chave]; }

    console.log(`${st === 'falhou' ? '✗' : '+'} ${chave}: criando (tentativa ${n}/${MAX_TENTATIVAS})`);
    const out = await insistir(tool, args, chave);
    const id = idDe(out);
    if (!id) { console.log(`  ! ${chave}: ${String(out).slice(0, 100)}`); await sleep(ESPERA_MS); continue; }
    m.ids[chave] = id; gravar(m);
    await sleep(ESPERA_MS);
  }
  console.log(`✗ ${chave}: desisti apos ${MAX_TENTATIVAS} tentativas`);
  return null;
}

// ---------- 1. herói base ----------
const baseId = ler().ids.base ?? await garantir('base', 'create_character', BASE.create);
if (!baseId) { console.log('\nSem heroi base, nao da para criar as variantes.'); process.exit(1); }

// ---------- 2. skins de roupa, como estados do base ----------
for (const chave of PILOTO) {
  await garantir(chave, 'create_character_state', {
    character_id: baseId,
    edit_description: VESTES[chave],
    state_name: chave,
  });
}

// ---------- 3. relatório ----------
const m = ler();
console.log('\n--- ids ---');
for (const [k, v] of Object.entries(m.ids)) console.log(`${k}: ${v}`);
console.log('\nEstilo travado:', JSON.stringify(ESTILO));
