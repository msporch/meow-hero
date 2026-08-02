// Regenera só os personagens (novo tamanho), limpando os antigos do manifesto e do _raw.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MANIFEST = path.join(HERE, '.cache', 'jobs.json');
const RAW = path.join(ROOT, 'assets', '_raw');

const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
m.characters = {};
m.charAnims = {};
fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2));

for (const f of fs.readdirSync(RAW)) {
  if (/^(hero|cat)_/.test(f)) fs.unlinkSync(path.join(RAW, f));
}
console.log('manifesto e PNGs antigos de personagem limpos\n');

const run = s => {
  console.log(`\n=== ${s} ===`);
  execFileSync(process.execPath, [path.join(HERE, s)], { stdio: 'inherit', cwd: ROOT });
};

run('gen-assets.mjs');
run('gen-anims.mjs');
run('fetch-assets.mjs');
