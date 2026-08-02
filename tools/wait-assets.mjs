// Roda fetch-assets em loop até tudo ficar pronto, depois aplica o demake.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (let i = 1; i <= 40; i++) {
  let pending = false;
  try {
    execFileSync(process.execPath, [path.join(HERE, 'fetch-assets.mjs')], { stdio: 'inherit', cwd: ROOT });
  } catch (e) {
    pending = e.status === 2;
    if (!pending) throw e;
  }
  if (!pending) break;
  console.log(`\n--- ainda faltam assets, nova tentativa em 25s (${i}) ---\n`);
  await sleep(25000);
}

console.log('\n=== demake ===');
execFileSync(process.execPath, [path.join(HERE, 'demake.mjs')], { stdio: 'inherit', cwd: ROOT });
