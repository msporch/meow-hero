// Instala a arte da v2 em assets/, que é de onde o jogo carrega.
//
// É um passo separado do demake de propósito: dá para gerar, olhar a folha de
// contato e refazer o que ficou ruim sem nunca mexer no que está no ar. Só
// quando o elenco passa é que ele entra.
//
// Antes de copiar, confere que o atlas tem TUDO que o jogo pede — skins.js
// monta os nomes das animações a partir dos ids das skins, então uma skin sem
// animação vira um corredor invisível, não um erro.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const GBA = path.join(ROOT, 'assets', '_gba');
const DESTINO = path.join(ROOT, 'assets');

const forcar = process.argv.includes('--forcar');

if (!fs.existsSync(path.join(GBA, 'atlas.json'))) {
  console.log('sem assets/_gba/atlas.json — rode tools/v2/demake-gba.mjs antes');
  process.exit(1);
}

const atlas = JSON.parse(fs.readFileSync(path.join(GBA, 'atlas.json'), 'utf8'));

// ---------- o que o jogo exige ----------
const skins = [...fs.readFileSync(path.join(ROOT, 'js', 'skins.js'), 'utf8')
  .matchAll(/anim:\s*'([a-z_0-9]+)'/g)].map(m => m[1]);
const DECOS = ['streetlight', 'bush', 'hydrant', 'trash_bin', 'cone', 'box'];
const SPRITES = [...DECOS, 'coin', 'milk', 'sign', 'ground', 'bg_sky', 'bg_city', 'title_art'];

const faltando = [];
for (const s of skins) {
  for (const a of ['run', 'idle']) if (!atlas.anims[`${s}_${a}`]) faltando.push(`anim ${s}_${a}`);
}
for (const s of SPRITES) if (!atlas.sprites[s]) faltando.push(`sprite ${s}`);

if (faltando.length) {
  console.log(`✗ faltam ${faltando.length} peca(s):`);
  faltando.forEach(f => console.log('  ' + f));
  if (!forcar) {
    console.log('\nnada foi copiado. use --forcar para instalar mesmo assim.');
    process.exit(1);
  }
  console.log('\n--forcar: instalando incompleto.');
}

// ---------- cópia ----------
function copiaPasta(de, para) {
  fs.mkdirSync(para, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(de)) {
    const orig = path.join(de, f);
    if (fs.statSync(orig).isDirectory()) { n += copiaPasta(orig, path.join(para, f)); continue; }
    fs.copyFileSync(orig, path.join(para, f));
    n++;
  }
  return n;
}

// sprites/ é substituída inteira: sobra da v1 com o mesmo nome seria servida
// junto e ninguém notaria até ver um sprite verde no meio do elenco.
fs.rmSync(path.join(DESTINO, 'sprites'), { recursive: true, force: true });
const nSprites = copiaPasta(path.join(GBA, 'sprites'), path.join(DESTINO, 'sprites'));
const nIcones = fs.existsSync(path.join(GBA, 'icons'))
  ? copiaPasta(path.join(GBA, 'icons'), path.join(DESTINO, 'icons')) : 0;
fs.copyFileSync(path.join(GBA, 'atlas.json'), path.join(DESTINO, 'atlas.json'));

console.log(`✓ ${nSprites} sprites, ${nIcones} icones, atlas.json → assets/`);
console.log(`  ${Object.keys(atlas.anims).length} animacoes, ${Object.keys(atlas.sprites).length} sprites`);
console.log('\nlembre de subir a VERSION em sw.js — o cache e cache-first.');
