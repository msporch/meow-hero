// Testes do fantasma: interpolação do traçado e escolha de qual corrida guardar.
// storage.js roda em Node porque os acessos a localStorage são protegidos.
import { ghostDistanceAt, recordRun, getGhost, resetAll, load } from '../js/storage.js';
import { GHOST_TRACE_S } from '../js/config.js';

let pass = 0, fail = 0;
const approx = (a, b, tol) => Math.abs(a - b) <= tol;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FALHA ${name} ${detail}`); }
}

const traco = (...v) => ({ intervalS: GHOST_TRACE_S, trace: v });

console.log('\n— interpolação do traçado —');
{
  // Amostras a cada 5 s: 0, 10, 20, 30 m
  const g = traco(0, 10, 20, 30);
  check('t=0 → 0 m', ghostDistanceAt(g, 0) === 0);
  check('t=5 → 10 m', ghostDistanceAt(g, 5) === 10);
  check('meio do intervalo interpola', approx(ghostDistanceAt(g, 7.5), 15, 0.001), `→ ${ghostDistanceAt(g, 7.5)}`);
  check('um quarto do intervalo', approx(ghostDistanceAt(g, 6.25), 12.5, 0.001));
  check('depois do fim fica parado', ghostDistanceAt(g, 999) === 30);
  check('antes do inicio usa a primeira', ghostDistanceAt(g, -5) === 0);
  check('traçado vazio → null', ghostDistanceAt(traco(), 5) === null);
  check('sem fantasma → null', ghostDistanceAt(null, 5) === null);
}

console.log('\n— ritmo irregular é preservado —');
{
  // Alguém que acelera: 0, 5, 15, 30
  const g = traco(0, 5, 15, 30);
  check('trecho lento', approx(ghostDistanceAt(g, 2.5), 2.5, 0.001));
  check('trecho rápido', approx(ghostDistanceAt(g, 12.5), 22.5, 0.001));
}

console.log('\n— qual corrida vira fantasma —');
{
  resetAll();
  const base = { goalKm: 5, coins: 0, mode: 'demo' };

  recordRun({ ...base, distanceM: 3000, seconds: 900, saved: false, trace: [0, 100, 200] });
  check('primeira corrida vira fantasma', getGhost(5)?.distanceM === 3000);

  recordRun({ ...base, distanceM: 2000, seconds: 900, saved: false, trace: [0, 50] });
  check('incompleta pior não substitui', getGhost(5).distanceM === 3000, `→ ${getGhost(5).distanceM}`);

  recordRun({ ...base, distanceM: 4000, seconds: 900, saved: false, trace: [0, 130] });
  check('incompleta melhor substitui', getGhost(5).distanceM === 4000);

  recordRun({ ...base, distanceM: 5000, seconds: 1800, saved: true, trace: [0, 200] });
  check('completa supera incompleta', getGhost(5).saved === true);

  recordRun({ ...base, distanceM: 5000, seconds: 2400, saved: true, trace: [0, 150] });
  check('completa mais lenta não substitui', getGhost(5).seconds === 1800, `→ ${getGhost(5).seconds}`);

  recordRun({ ...base, distanceM: 5000, seconds: 1500, saved: true, trace: [0, 250] });
  check('completa mais rápida substitui', getGhost(5).seconds === 1500);

  recordRun({ ...base, distanceM: 6000, seconds: 100, saved: true, goalKm: 10, trace: [0, 300] });
  check('cada meta tem seu fantasma', getGhost(5).seconds === 1500 && getGhost(10) !== null);
  check('meta sem corrida não tem fantasma', getGhost(3) === null);
}

console.log('\n— traçado curto demais é ignorado —');
{
  resetAll();
  recordRun({ goalKm: 2, distanceM: 500, seconds: 100, coins: 0, saved: false, mode: 'demo', trace: [0] });
  check('uma amostra só não vira fantasma', getGhost(2) === null);

  recordRun({ goalKm: 2, distanceM: 500, seconds: 100, coins: 0, saved: false, mode: 'demo' });
  check('sem traçado não vira fantasma', getGhost(2) === null);
}

console.log('\n— histórico segue funcionando —');
{
  resetAll();
  recordRun({ goalKm: 5, distanceM: 5000, seconds: 1800, coins: 120, saved: true, mode: 'demo', trace: [0, 100] });
  const d = load();
  check('moedas somadas', d.coins === 120);
  check('gato contabilizado', d.catsSaved === 1);
  check('corrida no histórico', d.runs.length === 1 && d.runs[0].distanceM === 5000);
  check('histórico não guarda traçado', d.runs[0].trace === undefined);
}

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
