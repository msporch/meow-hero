// Cenário, props e tela inicial da v2, em cor.
//
// A v1 forçava a paleta DMG via `color_image_url` — era isso que deixava tudo
// verde. Aqui o gerador trabalha em cor livre e a redução acontece depois, no
// demake, para uma paleta de fundo de GBA.
//
// Decisão de arte: cidade de dia, céu claro. O jogo é sobre correr e juntar
// moedas; um cenário noturno pediria contraste invertido e brigaria com o
// elenco, que foi aprovado em luz de dia.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, isRateLimited } from '../pl.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ESTADO = path.join(HERE, 'cenario.json');

const MAX_TENTATIVAS = 3;
const ESPERA_MS = 12000;

/** Estilo comum a tudo que não é personagem. Espelha a bíblia. */
const COMUM = {
  outline: 'selective outline',
  shading: 'detailed shading',
  detail: 'medium detail',
  text_guidance_scale: 8,
};

/** Props de rua e itens. Fundo transparente. */
export const PROPS = {
  coin:        { description: 'shiny gold coin with a star engraved, front view, gleaming', width: 48, height: 48 },
  milk:        { description: 'small carton of milk with a blue label', width: 48, height: 48 },
  trash_bin:   { description: 'green metal street trash bin with a lid', width: 48, height: 64 },
  cone:        { description: 'orange traffic cone with a white reflective stripe', width: 48, height: 48 },
  box:         { description: 'stack of brown cardboard boxes', width: 48, height: 48 },
  hydrant:     { description: 'red street fire hydrant', width: 48, height: 64 },
  sign:        { description: 'roadside distance marker sign, blank square plate on a metal pole', width: 48, height: 64 },
  streetlight: { description: 'tall city street lamp post with a lamp head', width: 48, height: 96 },
  bush:        { description: 'small round green bush in a stone planter', width: 48, height: 48 },
};

/** Camadas de parallax e tela de título. Opacas. */
export const CENAS = {
  bg_sky:    { description: 'distant hazy city skyline against a clear blue daytime sky, flat game background layer', width: 160, height: 80, opaco: true, detail: 'low detail' },
  bg_city:   { description: 'row of colorful city buildings with windows and rooftops on a clear day, side view game parallax layer', width: 160, height: 96, opaco: true },
  title_art: { description: 'a runner sprinting down a sunny city street grabbing big gold coins floating in the air, retro game title screen illustration', width: 160, height: 144, opaco: true },
};

/** Chão: asfalto + calçada, no mesmo tileset lateral da v1. */
export const TILESET = {
  lower_description: 'grey asphalt road with cracks and worn markings',
  transition_description: 'light concrete sidewalk pavement with a curb',
  transition_size: 0.5,
  tile_size: { width: 16, height: 16 },
  outline: 'selective outline',
  shading: 'detailed shading',
  detail: 'medium detail',
  seed: 7412,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ler = () => (fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, 'utf8')) : { props: {}, cenas: {}, tileset: {} });
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

/** Cria com teto de tentativas e verifica o estado antes de gastar de novo. */
async function garantir(balde, chave, tool, args, verificador) {
  const m = ler();
  if (m[balde][chave]) {
    const st = await verificador(m[balde][chave]);
    if (st === 'pronto') { console.log(`· ${chave} ja existe`); return; }
    if (st === 'processando') { console.log(`… ${chave} processando`); return; }
  }
  for (let n = 1; n <= MAX_TENTATIVAS; n++) {
    const out = await insistir(tool, args, chave);
    const id = idDe(out);
    if (id) {
      const mm = ler(); mm[balde][chave] = id; gravar(mm);
      console.log(`+ ${chave}`);
      // Espaça as chamadas: este script roda ao lado da produção do elenco, e
      // são 8 slots de job para os dois. Encher a fila aqui faria o produzir
      // gastar tentativa à toa.
      await sleep(20000);
      return;
    }
    console.log(`✗ ${chave} (${n}/${MAX_TENTATIVAS}): ${String(out).slice(0, 80)}`);
    await sleep(ESPERA_MS);
  }
  console.log(`✗ ${chave}: DESISTI`);
}

const estadoImagem = async id => {
  try {
    const t = await call('get_image', { job_id: id });
    if (/status:\s*failed/.test(t)) return 'falhou';
    return /status:\s*completed/.test(t) ? 'pronto' : 'processando';
  } catch { return 'processando'; }
};
const estadoTileset = async id => {
  try {
    const t = await call('get_sidescroller_tileset', { tileset_id: id });
    if (/status:\s*failed/.test(t)) return 'falhou';
    return /status:\s*completed/.test(t) ? 'pronto' : 'processando';
  } catch { return 'processando'; }
};

console.log('=== props ===');
for (const [chave, cfg] of Object.entries(PROPS)) {
  await garantir('props', chave, 'create_image_pixflux', {
    ...COMUM, ...cfg, view: 'side', no_background: true,
  }, estadoImagem);
}

console.log('\n=== cenas ===');
for (const [chave, cfg] of Object.entries(CENAS)) {
  const { opaco, ...resto } = cfg;
  await garantir('cenas', chave, 'create_image_pixflux', {
    ...COMUM, ...resto, view: 'side', no_background: false,
  }, estadoImagem);
}

console.log('\n=== tileset ===');
await garantir('tileset', 'road', 'create_sidescroller_tileset', TILESET, estadoTileset);

console.log('\n--- ids ---');
console.log(JSON.stringify(ler(), null, 2));
