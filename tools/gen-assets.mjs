// Fase 1: dispara todos os jobs de geração no PixelLab e guarda os IDs.
// Idempotente — rode quantas vezes quiser, só cria o que ainda não existe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, isRateLimited } from './pl.mjs';
import { paletteDataUrl } from './gbpalette.mjs';
import { CHARACTERS, SPRITES, SCENES, TILESETS } from './assets.config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, '.cache');
const MANIFEST = path.join(CACHE, 'jobs.json');

fs.mkdirSync(CACHE, { recursive: true });
const m = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
m.characters ??= {};
m.sprites ??= {};
m.scenes ??= {};
m.tilesets ??= {};
m.spriteAnims ??= {};

const save = () => fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
const idFrom = txt => (txt.match(/(?:^|\n)\s*(?:id|job_id|tileset_id|character_id)\s*[:=]\s*([0-9a-f-]{36})/i) || [])[1]
                   || (txt.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/) || [])[0];

const PALETTE = paletteDataUrl();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// O PixelLab aceita no máximo 8 jobs simultâneos — em rate limit, espera e tenta de novo.
async function fire(label, tool, args, bucket, key) {
  if (bucket[key]) { console.log(`· ${label} já enfileirado (${bucket[key]})`); return; }
  for (let attempt = 1; attempt <= 60; attempt++) {
    let out;
    try {
      out = await call(tool, args);
    } catch (e) {
      out = e.message;
    }
    if (isRateLimited(out)) {
      console.log(`… ${label}: fila cheia, aguardando (tentativa ${attempt})`);
      await sleep(25000);
      continue;
    }
    const id = idFrom(out);
    if (id) {
      bucket[key] = id;
      save();
      console.log(`✓ ${label} → ${id}`);
      return;
    }
    console.log(`✗ ${label}: ${String(out).slice(0, 220)}`);
    return;
  }
  console.log(`✗ ${label}: desisti após muitas tentativas`);
}

// 1. Personagens
for (const [key, cfg] of Object.entries(CHARACTERS)) {
  await fire(`personagem ${key}`, 'create_character', cfg.create, m.characters, key);
}

// 2. Sprites com paleta Game Boy forçada
for (const [key, cfg] of Object.entries(SPRITES)) {
  await fire(`sprite ${key}`, 'create_image_pixflux', {
    ...cfg,
    no_background: true,
    outline: 'single color black outline',
    shading: 'flat shading',
    detail: cfg.detail ?? 'low detail',
    color_image_url: PALETTE,
    text_guidance_scale: 9,
  }, m.sprites, key);
}

// 3. Fundos e telas
for (const [key, cfg] of Object.entries(SCENES)) {
  await fire(`cena ${key}`, 'create_image_pixflux', {
    ...cfg,
    view: 'side',
    outline: 'selective outline',
    shading: 'flat shading',
    color_image_url: PALETTE,
    text_guidance_scale: 9,
  }, m.scenes, key);
}

// 4. Tilesets
for (const [key, cfg] of Object.entries(TILESETS)) {
  await fire(`tileset ${key}`, 'create_sidescroller_tileset', cfg, m.tilesets, key);
}

console.log('\nManifesto:', MANIFEST);
