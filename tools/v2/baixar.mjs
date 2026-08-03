// Baixa os frames de todas as animações do elenco v2 para assets/_v2raw/.
//
// Diretório próprio de propósito: a primeira tentativa GBA (tools/fetch-gba.mjs)
// deixou o elenco inconsistente em assets/_raw_gba/ com estes mesmos nomes, e
// esta função pula arquivo que já existe.
// Idempotente: pula o que já está em disco.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { call } from '../pl.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const RAW = path.join(ROOT, 'assets', '_v2raw');
const ESTADO = path.join(HERE, 'pilot.json');
const CEN = path.join(HERE, 'cenario.json');

fs.mkdirSync(RAW, { recursive: true });
const token = fs.readFileSync(path.join(HERE, '..', '.pixellab-token'), 'utf8').trim();

const relatorio = { ok: [], pendente: [], falha: [] };

// O corredor padrão se chama `base` na produção (é a origem dos estados de
// roupa) mas `hero` no jogo, onde skins.js e game.js pedem hero_run/hero_idle.
const apelido = n => n.replace(/^base(?=_|$)/, 'hero');

async function baixar(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return 'cache';
  const headers = url.includes('api.pixellab.ai') ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 8 || buf[1] !== 0x50) throw new Error('resposta nao-PNG');
  fs.writeFileSync(dest, buf);
  return 'baixado';
}

/** Extrai os grupos de animação e as URLs por direção. */
function parseAnimacoes(txt) {
  const out = [];
  let atual = null;
  for (const linha of txt.split('\n')) {
    const cab = linha.match(/^ {2}(\S+)\s+[—-]\s+/);
    if (cab) { atual = { nome: cab[1], dirs: {} }; out.push(atual); continue; }
    const d = linha.match(/^ {4}([a-z-]+):\s*(https?:\/\/.+)$/);
    if (d && atual) atual.dirs[d[1]] = d[2].split(',').map(s => s.trim()).filter(Boolean);
  }
  return out;
}

// ---------- personagens ----------
const ids = JSON.parse(fs.readFileSync(ESTADO, 'utf8')).ids;
for (const [chave, id] of Object.entries(ids)) {
  if (!id) continue;
  // `<nome>_reprovado` guarda a versão que a inspeção visual recusou. As
  // animações dela têm o MESMO nome da versão boa, e como o download pula
  // arquivo existente, quem chegasse primeiro venceria. Fica de fora.
  if (chave.endsWith('_reprovado')) continue;
  let txt;
  try { txt = await call('get_character', { character_id: id, include_preview: false }); }
  catch (e) { relatorio.falha.push(`${chave}: ${e.message}`); continue; }

  if (!/status:\s*completed/.test(txt)) { relatorio.pendente.push(chave); continue; }

  // Pose parada (rotação leste), útil como retrato na loja.
  const rot = txt.match(/^ {2}east:\s*(https?:\/\/\S+)$/m);
  if (rot) { try { await baixar(rot[1], path.join(RAW, `${apelido(chave)}_pose_00.png`)); } catch { /* opcional */ } }

  for (const anim of parseAnimacoes(txt)) {
    const urls = anim.dirs.east || Object.values(anim.dirs)[0] || [];
    if (!urls.length) { relatorio.pendente.push(`${anim.nome} (sem frames)`); continue; }
    try {
      for (let i = 0; i < urls.length; i++) {
        await baixar(urls[i], path.join(RAW, `${apelido(anim.nome)}_${String(i).padStart(2, '0')}.png`));
      }
      relatorio.ok.push(`${apelido(anim.nome)} (${urls.length}f)`);
    } catch (e) { relatorio.falha.push(`${anim.nome}: ${e.message}`); }
  }
}

// ---------- cenário, props e tileset ----------
if (fs.existsSync(CEN)) {
  const cen = JSON.parse(fs.readFileSync(CEN, 'utf8'));

  // Prefixos diferentes porque o demake trata os dois de forma oposta: prop
  // tem alfa e é recortado, cena é opaca e vai inteira.
  for (const balde of ['props', 'cenas']) {
    const prefixo = balde === 'props' ? 'prop' : 'cena';
    for (const [chave, id] of Object.entries(cen[balde] ?? {})) {
      try {
        const txt = await call('get_image', { job_id: id });
        if (!/status:\s*completed/.test(txt)) { relatorio.pendente.push(chave); continue; }
        const urls = [...txt.matchAll(/https:\/\/\S+/g)].map(x => x[0].replace(/[,)]$/, ''));
        const dl = urls.find(u => /download/.test(u)) || urls[0];
        if (!dl) throw new Error('sem URL');
        await baixar(dl, path.join(RAW, `${prefixo}_${chave}.png`));
        relatorio.ok.push(`${prefixo} ${chave}`);
      } catch (e) { relatorio.falha.push(`${chave}: ${e.message}`); }
    }
  }

  for (const [chave, id] of Object.entries(cen.tileset ?? {})) {
    try {
      const txt = await call('get_sidescroller_tileset', { tileset_id: id });
      if (!/status:\s*completed/.test(txt)) { relatorio.pendente.push(`tileset ${chave}`); continue; }
      const png = (txt.match(/download_png:\s*(https?:\/\/\S+)/) || [])[1];
      if (!png) throw new Error('sem download_png');
      await baixar(png, path.join(RAW, `tileset_${chave}.png`));
      relatorio.ok.push(`tileset ${chave}`);
    } catch (e) { relatorio.falha.push(`${chave}: ${e.message}`); }
  }
}

console.log(`✓ prontos (${relatorio.ok.length})`);
relatorio.ok.forEach(s => console.log('  ' + s));
if (relatorio.pendente.length) {
  console.log(`\n… pendentes (${relatorio.pendente.length})`);
  relatorio.pendente.forEach(s => console.log('  ' + s));
}
if (relatorio.falha.length) {
  console.log(`\n✗ falhas (${relatorio.falha.length})`);
  relatorio.falha.forEach(s => console.log('  ' + s));
}
process.exit(relatorio.pendente.length ? 2 : 0);
