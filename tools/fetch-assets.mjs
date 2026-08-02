// Fase 3: baixa tudo que o PixelLab já terminou para assets/_raw/.
// Idempotente: pula o que já está em disco.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call } from './pl.mjs';
import { CHARACTERS } from './assets.config.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const RAW = path.join(ROOT, 'assets', '_raw');
const MANIFEST = path.join(HERE, '.cache', 'jobs.json');

fs.mkdirSync(RAW, { recursive: true });
const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

const token = fs.readFileSync(path.join(HERE, '.pixellab-token'), 'utf8').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const report = { ok: [], pending: [], failed: [] };

async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return 'cached';
  const headers = url.includes('api.pixellab.ai') ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url.slice(0, 90)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8 || buf[1] !== 0x50) throw new Error(`resposta nao-PNG (${buf.length}b)`);
  fs.writeFileSync(dest, buf);
  return 'baixado';
}

// ---------- imagens soltas (sprites + cenas) ----------
async function fetchImages(bucket, prefix) {
  for (const [key, jobId] of Object.entries(bucket)) {
    const dest = path.join(RAW, `${prefix}${key}.png`);
    if (fs.existsSync(dest)) { report.ok.push(`${prefix}${key} (cache)`); continue; }
    try {
      const txt = await call('get_image', { job_id: jobId });
      if (!/status:\s*completed/.test(txt)) {
        report.pending.push(`${prefix}${key}: ${(txt.match(/status:\s*(\S+)/) || [])[1] || '?'}`);
        continue;
      }
      const urls = [...txt.matchAll(/https:\/\/\S+/g)].map(x => x[0].replace(/[,)]$/, ''));
      const dl = urls.find(u => /download/.test(u)) || urls[0];
      if (!dl) throw new Error('sem URL de download');

      const frames = Number((txt.match(/frames:\s*(\d+)/) || [])[1] || 1);
      if (frames > 1) {
        // animate_image devolve várias imagens: salva cada frame.
        for (let i = 0; i < urls.length; i++) {
          await download(urls[i], path.join(RAW, `${prefix}${key}_${String(i).padStart(2, '0')}.png`));
        }
        report.ok.push(`${prefix}${key} (${urls.length} frames)`);
      } else {
        await download(dl, dest);
        report.ok.push(`${prefix}${key}`);
      }
    } catch (e) {
      report.failed.push(`${prefix}${key}: ${e.message}`);
    }
  }
}

// ---------- personagens: rotações + animações ----------
function parseAnimations(txt) {
  const out = [];
  const lines = txt.split('\n');
  let cur = null;
  for (const line of lines) {
    const head = line.match(/^ {2}(\S+)\s+[—-]\s+/);
    if (head) { cur = { name: head[1], dirs: {} }; out.push(cur); continue; }
    const dir = line.match(/^ {4}([a-z-]+):\s*(https?:\/\/.+)$/);
    if (dir && cur) {
      cur.dirs[dir[1]] = dir[2].split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return out;
}

async function fetchCharacters() {
  for (const [key, id] of Object.entries(m.characters || {})) {
    try {
      const txt = await call('get_character', { character_id: id, include_preview: false });
      if (!/status:\s*completed/.test(txt)) { report.pending.push(`char ${key}`); continue; }

      // Rotação leste = personagem virado para a direita (o sentido da corrida).
      // Nome próprio (_pose_) para não colidir com uma animação chamada "<key>_idle".
      const rot = txt.match(/^ {2}east:\s*(https?:\/\/\S+)$/m);
      if (rot) await download(rot[1], path.join(RAW, `${key}_pose_00.png`));

      const found = new Set();
      for (const anim of parseAnimations(txt)) {
        const urls = anim.dirs.east || Object.values(anim.dirs)[0] || [];
        if (!urls.length) { report.pending.push(`${anim.name} (sem frames)`); continue; }
        for (let i = 0; i < urls.length; i++) {
          await download(urls[i], path.join(RAW, `${anim.name}_${String(i).padStart(2, '0')}.png`));
        }
        found.add(anim.name);
        report.ok.push(`${anim.name} (${urls.length}f)`);
      }

      // O personagem fica "completed" mesmo com animações ainda em geração —
      // então a pendência precisa ser medida contra a lista esperada.
      for (const a of CHARACTERS[key]?.animations ?? []) {
        if (!found.has(a.animation_name)) report.pending.push(`${a.animation_name} (gerando)`);
      }
    } catch (e) {
      report.failed.push(`char ${key}: ${e.message}`);
    }
  }
}

// ---------- tilesets ----------
async function fetchTilesets() {
  for (const [key, id] of Object.entries(m.tilesets || {})) {
    try {
      const txt = await call('get_sidescroller_tileset', { tileset_id: id });
      if (!/status:\s*completed/.test(txt)) { report.pending.push(`tileset ${key}`); continue; }
      const png = (txt.match(/download_png:\s*(https?:\/\/\S+)/) || [])[1];
      if (!png) throw new Error('sem download_png');
      await download(png, path.join(RAW, `tileset_${key}.png`));
      report.ok.push(`tileset ${key}`);
    } catch (e) {
      report.failed.push(`tileset ${key}: ${e.message}`);
    }
  }
}

await fetchImages(m.sprites || {}, '');
await fetchImages(m.scenes || {}, '');
await fetchImages(m.spriteAnims || {}, '');
await fetchCharacters();
await fetchTilesets();

console.log(`\n✓ prontos (${report.ok.length}):`);
report.ok.forEach(s => console.log('   ' + s));
if (report.pending.length) {
  console.log(`\n… ainda processando (${report.pending.length}):`);
  report.pending.forEach(s => console.log('   ' + s));
}
if (report.failed.length) {
  console.log(`\n✗ falhas (${report.failed.length}):`);
  report.failed.forEach(s => console.log('   ' + s));
}
process.exit(report.pending.length ? 2 : 0);
