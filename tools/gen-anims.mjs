// Fase 2: dispara as animações dos personagens (depende dos personagens estarem prontos).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call, isRateLimited } from './pl.mjs';
import { CHARACTERS } from './assets.config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(HERE, '.cache', 'jobs.json');
const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
m.charAnims ??= {};
const save = () => fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const [charKey, cfg] of Object.entries(CHARACTERS)) {
  const character_id = m.characters[charKey];
  if (!character_id) { console.log(`✗ ${charKey}: sem character_id`); continue; }

  // Espera o personagem base ficar pronto.
  for (let i = 0; i < 40; i++) {
    const st = await call('get_character', { character_id, include_preview: false });
    if (/status:\s*completed/.test(st)) break;
    console.log(`… ${charKey}: personagem ainda processando`);
    await sleep(15000);
  }

  for (const anim of cfg.animations) {
    const slot = `${charKey}_${anim.key}`;
    if (m.charAnims[slot]) { console.log(`· ${slot} já enfileirado`); continue; }
    const { key, ...args } = anim;

    for (let attempt = 1; attempt <= 60; attempt++) {
      let out;
      try {
        out = await call('animate_character', { character_id, ...args });
      } catch (e) { out = e.message; }

      if (isRateLimited(out)) {
        console.log(`… ${slot}: fila cheia, aguardando (${attempt})`);
        await sleep(25000);
        continue;
      }
      const gid = (out.match(/animation_group_id\s*[:=]\s*"?([0-9a-f-]{36})/i) || [])[1]
               || (out.match(/group\s*[:=]\s*"?([0-9a-f-]{36})/i) || [])[1];
      m.charAnims[slot] = { animation_name: args.animation_name, group: gid || null, raw: out.slice(0, 400) };
      save();
      console.log(`✓ ${slot}${gid ? ` → grupo ${gid}` : ''}`);
      break;
    }
  }
}

console.log('\nAnimações enfileiradas.');
