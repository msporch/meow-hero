// Garante que TODOS os personagens do catálogo existam, com animações.
//
// Substitui a corrente gen-assets → gen-anims → wait-assets para personagens.
// Ela não dava conta de dois casos que aparecem em lote grande:
//
//   1. O PixelLab aceita o pedido e SÓ DEPOIS falha ("Generation failed due to
//      heavy load"). Isso não é rate limit, então o retry antigo não pegava —
//      13 de 16 skins ficaram com status `failed` sem ninguém perceber.
//   2. Disparar 16 de uma vez satura a fila e provoca justamente essa falha.
//
// Aqui o trabalho vai em lotes pequenos, cada personagem é verificado depois
// de pronto e refeito quando falha.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, isRateLimited } from './pl.mjs';
import { CHARACTERS } from './assets.config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, '.cache', 'jobs.json');

const LOTE = 3;              // personagens criados por vez
const ESPERA_MS = 12000;     // intervalo entre verificações
const MAX_RODADAS = 60;

/**
 * Teto de tentativas por personagem.
 *
 * Sem isto o laço recria indefinidamente quem falha: um personagem que o
 * servidor recusa de forma consistente consumia uma geração por rodada, e 80
 * rodadas × 3 personagens queimaram ~240 gerações sem produzir nada. Agora
 * desiste, avisa, e segue com o resto.
 */
const MAX_TENTATIVAS = 3;
const tentativas = new Map();
const desistiu = new Set();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const carregar = () => JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const salvar = m => fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
const idDe = txt => (txt.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];

/** Estado de um personagem: 'ausente' | 'processando' | 'falhou' | 'pronto'. */
async function estado(id) {
  if (!id) return { st: 'ausente', anims: new Set() };
  let txt;
  try { txt = await call('get_character', { character_id: id, include_preview: false }); }
  catch { return { st: 'processando', anims: new Set() }; }

  if (/status:\s*failed/.test(txt)) return { st: 'falhou', anims: new Set() };
  if (!/status:\s*completed/.test(txt)) return { st: 'processando', anims: new Set() };

  const anims = new Set();
  for (const linha of txt.split('\n')) {
    const m = linha.match(/^ {2}(\S+)\s+[—-]\s+/);
    if (m) anims.add(m[1]);
  }
  return { st: 'pronto', anims };
}

/** Chama uma tool insistindo enquanto for rate limit. */
async function insistir(tool, args, rotulo) {
  for (let i = 0; i < 40; i++) {
    let out;
    try { out = await call(tool, args); } catch (e) { out = e.message; }
    if (isRateLimited(out)) { await sleep(15000); continue; }
    return out;
  }
  console.log(`  ! ${rotulo}: fila cheia demais, desisti nesta rodada`);
  return '';
}

for (let rodada = 1; rodada <= MAX_RODADAS; rodada++) {
  const m = carregar();
  m.characters ??= {};
  m.charAnims ??= {};

  const pendentes = [];
  let prontos = 0;

  for (const [chave, cfg] of Object.entries(CHARACTERS)) {
    const { st, anims } = await estado(m.characters[chave]);

    if (st === 'falhou') {
      const n = (tentativas.get(chave) ?? 0) + 1;
      tentativas.set(chave, n);
      if (n > MAX_TENTATIVAS) {
        if (!desistiu.has(chave)) {
          desistiu.add(chave);
          console.log(`✗ ${chave}: falhou ${MAX_TENTATIVAS}x, desistindo (nao gasta mais geracoes)`);
        }
        continue;
      }
      console.log(`✗ ${chave}: falhou (${n}/${MAX_TENTATIVAS}), refazendo`);
      delete m.characters[chave];
      for (const a of Object.keys(m.charAnims)) if (a.startsWith(`${chave}_`)) delete m.charAnims[a];
      salvar(m);
      pendentes.push({ chave, cfg, acao: 'criar' });
      continue;
    }
    if (st === 'ausente') { pendentes.push({ chave, cfg, acao: 'criar' }); continue; }
    if (st === 'processando') { pendentes.push({ chave, cfg, acao: 'esperar' }); continue; }

    const faltando = cfg.animations.filter(a => !anims.has(a.animation_name));
    if (faltando.length) pendentes.push({ chave, cfg, acao: 'animar', faltando });
    else prontos++;
  }

  console.log(`\n— rodada ${rodada}: ${prontos}/${Object.keys(CHARACTERS).length} completos —`);
  if (!pendentes.length) { console.log('tudo pronto.'); break; }

  // Cria em lotes pequenos: é a saturação da fila que provoca as falhas.
  const criar = pendentes.filter(p => p.acao === 'criar').slice(0, LOTE);
  for (const { chave, cfg } of criar) {
    const out = await insistir('create_character', cfg.create, chave);
    const id = idDe(out);
    if (id) {
      const mm = carregar(); mm.characters[chave] = id; salvar(mm);
      console.log(`+ ${chave} criado`);
    } else if (out) {
      console.log(`! ${chave}: ${out.slice(0, 90)}`);
    }
  }

  for (const p of pendentes.filter(p => p.acao === 'animar')) {
    for (const a of p.faltando) {
      const { key, ...args } = a;
      const out = await insistir('animate_character',
        { character_id: carregar().characters[p.chave], ...args }, a.animation_name);
      if (out && !/error/i.test(out)) {
        const mm = carregar();
        mm.charAnims[a.animation_name] = { animation_name: a.animation_name };
        salvar(mm);
        console.log(`+ ${a.animation_name}`);
      }
    }
  }

  await sleep(ESPERA_MS);
}
