// Testes da geração de percurso: determinismo, marcos de km e reta final limpa.
import { Course } from '../js/course.js';
import { PX_PER_M, CHUNK_PX, FINALE_M } from '../js/config.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FALHA ${name} ${detail}`); }
}

const dump = (c, n) => JSON.stringify(
  Array.from({ length: n }, (_, i) => c.chunk(i)).map(k => ({
    items: k.items.map(it => [it.type, it.x, it.y, it.id]),
    decos: k.decos.map(d => [d.type, d.x]),
    signs: k.signs.map(s => s.km),
  })));

console.log('\n— determinismo —');
{
  const a = new Course(5, 42), b = new Course(5, 42);
  check('mesma meta + semente = mesmo percurso', dump(a, 30) === dump(b, 30));

  const c = new Course(5, 43);
  check('semente diferente = percurso diferente', dump(a, 30) !== dump(c, 30));

  // O cache descarta chunks antigos; regerar precisa dar o mesmo resultado.
  const d = new Course(5, 42);
  for (let i = 0; i < 60; i++) d.chunk(i);        // força evicção
  check('regerar após evicção é idêntico', JSON.stringify(d.chunk(0)) === JSON.stringify(new Course(5, 42).chunk(0)));
}

console.log('\n— dimensões —');
{
  const c = new Course(6);
  check('6 km = 6000 m', c.goalM === 6000);
  check('comprimento em px bate com PX_PER_M', c.lengthPx === 6000 * PX_PER_M);
  check('reta final começa a FINALE_M do fim',
    c.finaleStartPx === (6000 - FINALE_M) * PX_PER_M);
  check('total de chunks cobre o percurso',
    c.totalChunks * CHUNK_PX >= c.lengthPx && (c.totalChunks - 1) * CHUNK_PX < c.lengthPx);
}

console.log('\n— marcos de quilômetro —');
{
  const c = new Course(5);
  const kms = [];
  for (let i = 0; i < c.totalChunks; i++) for (const s of c.chunk(i).signs) kms.push(s.km);
  check('4 placas em 5 km (a última é a chegada)', kms.length === 4, `→ ${kms.join(',')}`);
  check('placas em ordem 1..4', kms.join(',') === '1,2,3,4');

  const c1 = new Course(1);
  const kms1 = [];
  for (let i = 0; i < c1.totalChunks; i++) for (const s of c1.chunk(i).signs) kms1.push(s.km);
  check('nenhuma placa em 1 km', kms1.length === 0, `→ ${kms1.join(',')}`);
}

console.log('\n— reta final limpa —');
{
  const c = new Course(2);
  let itemsNaRetaFinal = 0, chunksFinais = 0;
  for (let i = 0; i < c.totalChunks; i++) {
    const k = c.chunk(i);
    if (k.finale) { chunksFinais++; itemsNaRetaFinal += k.items.length; }
  }
  check('existe reta final', chunksFinais > 0);
  check('sem moedas na reta final', itemsNaRetaFinal === 0, `→ ${itemsNaRetaFinal}`);
}

console.log('\n— ids únicos —');
{
  const c = new Course(3);
  const ids = new Set();
  let total = 0;
  for (let i = 0; i < 120; i++) for (const it of c.chunk(i).items) { ids.add(it.id); total++; }
  check('todo item tem id único', ids.size === total, `→ ${ids.size}/${total}`);
}

console.log('\n— coleta —');
{
  const c = new Course(1);
  const it = c.chunk(0).items[0];
  check('item começa não coletado', !c.isTaken(it.id));
  c.take(it.id);
  check('item fica coletado', c.isTaken(it.id));
}

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
