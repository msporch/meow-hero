// Testes do rastreamento (sem navegador).
//
// O movimento vem dos passos; o GPS só mede. Os testes cobrem as duas coisas
// separadamente e, principalmente, a calibração da passada — é ela que impede
// a distância do jogo de divergir da real.
import { Tracker, haversine, formatTime, formatKmh, MODES } from '../js/tracker.js';
import { STEP_PEAK, STEP_VALLEY, STEP_MIN_GAP_MS } from '../js/config.js';

let pass = 0, fail = 0;
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FALHA ${name} ${detail}`); }
}

const fix = (lat, lon, acc, t) => ({ coords: { latitude: lat, longitude: lon, accuracy: acc }, timestamp: t });
const north = (lat, m) => lat + (m / 111320);

/** Roda um bloco com performance.now() controlado. */
function comRelogio(fn) {
  const real = performance.now.bind(performance);
  const clock = { now: 1000 };
  performance.now = () => clock.now;
  try { return fn(clock); } finally { performance.now = real; }
}

console.log('\n— haversine —');
check('1 grau de latitude ~ 111.19 km',
  approx(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111194, 50));
check('mesmo ponto = 0 m',
  haversine({ lat: -23.55, lon: -46.63 }, { lat: -23.55, lon: -46.63 }) === 0);
check('100 m ao norte',
  approx(haversine({ lat: -23.55, lon: -46.63 }, { lat: north(-23.55, 100), lon: -46.63 }), 100, 1));

console.log('\n— modos —');
check('três modos oferecidos', MODES.length === 3);
check('padrão move por passos', MODES[0].id === 'steps+gps');
check('existe modo sem GPS', MODES.some(m => m.id === 'steps'));

console.log('\n— passos movem o jogo —');
{
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps+gps'; tr.stride = 0.8;
  for (let i = 0; i < 50; i++) tr.step(500);
  check('50 passos contados', tr.steps === 50);
  check('distância = passos x passada', approx(tr.distanceM, 40, 0.01), `→ ${tr.distanceM.toFixed(2)}`);
  check('GPS não interferiu', tr.gpsDistanceM === 0);
  check('cadência 500ms → 1.6 m/s', approx(tr.cadenceSpeed, 1.6, 0.01), `→ ${tr.cadenceSpeed.toFixed(2)}`);
}

console.log('\n— detector de picos —');
comRelogio(clock => {
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps';
  for (let i = 0; i < 100; i++) tr._registerAccel(0, clock.now);
  for (let i = 0; i < 40; i++) {
    clock.now += STEP_MIN_GAP_MS + 50; tr._registerAccel(STEP_PEAK + 1, clock.now);
    clock.now += STEP_MIN_GAP_MS + 50; tr._registerAccel(STEP_VALLEY - 1, clock.now);
  }
  check('40 picos = 40 passos', tr.steps === 40, `→ ${tr.steps}`);

  // Ruído abaixo do limiar não pode virar passo.
  const antes = tr.steps;
  for (let i = 0; i < 50; i++) { clock.now += 300; tr._registerAccel(STEP_PEAK - 0.5, clock.now); }
  check('ruído fraco não conta passo', tr.steps === antes, `→ +${tr.steps - antes}`);
});

console.log('\n— movimento liga na hora e desliga no silêncio —');
comRelogio(clock => {
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps';

  tr._lastStepAt = clock.now; tr.step(500);
  tr.tick(1 / 60);
  check('anda já no primeiro passo', tr.moving === true);
  check('velocidade de exibição > 0', tr.displaySpeedMs > 0);

  let parouApos = -1;
  const t0 = clock.now;
  for (let i = 0; i < 60 * 10 && parouApos < 0; i++) {
    clock.now += 1000 / 60;
    tr.tick(1 / 60);
    if (!tr.moving) parouApos = (clock.now - t0) / 1000;
  }
  check('para em ~2 s de silêncio', parouApos > 1 && parouApos < 3.5, `→ ${parouApos.toFixed(1)} s`);
  check('velocidade de exibição zera', tr.displaySpeedMs === 0);
});

console.log('\n— GPS só mede, não move —');
comRelogio(clock => {
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps+gps';
  let lat = -23.55;
  tr._onFix(fix(lat, -46.63, 8, clock.now));
  for (let i = 0; i < 20; i++) {
    clock.now += 3000; lat = north(lat, 10);
    tr._onFix(fix(lat, -46.63, 8, clock.now));
  }
  check('GPS acumulou ~200 m', approx(tr.gpsDistanceM, 200, 2), `→ ${tr.gpsDistanceM.toFixed(1)}`);
  check('distância do jogo continua 0', tr.distanceM === 0, `→ ${tr.distanceM}`);
  check('herói não anda só por GPS', tr.moving === false);
  check('posição disponível p/ multijogador', tr.position !== null && approx(tr.position.lat, lat, 1e-9));
});

console.log('\n— filtros do GPS —');
// Cada filtro em um tracker próprio: um fix rejeitado NÃO move a referência
// interna, então reaproveitar o mesmo tracker contamina o teste seguinte.
comRelogio(clock => {
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps+gps';
  let lat = -23.55;
  tr._onFix(fix(lat, -46.63, 8, clock.now));
  for (let i = 0; i < 5; i++) { clock.now += 1000; lat = north(lat, 10); tr._onFix(fix(lat, -46.63, 90, clock.now)); }
  check('fix impreciso não acumula', tr.gpsDistanceM === 0, `→ ${tr.gpsDistanceM}`);
  check('contabilizado como impreciso', tr.fixesImprecisos === 5);
});

comRelogio(clock => {
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps+gps';
  const base = -23.55;
  tr._onFix(fix(base, -46.63, 6, clock.now));
  for (let i = 0; i < 20; i++) { clock.now += 1000; tr._onFix(fix(north(base, i % 2 ? 0.7 : -0.7), -46.63, 6, clock.now)); }
  check('jitter parado não acumula', tr.gpsDistanceM === 0, `→ ${tr.gpsDistanceM.toFixed(2)}`);
  check('contabilizado como jitter', tr.fixesJitter > 0);
});

comRelogio(clock => {
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps+gps';
  const base = -23.55;
  tr._onFix(fix(base, -46.63, 6, clock.now));
  clock.now += 1000;
  tr._onFix(fix(north(base, 500), -46.63, 6, clock.now));   // 500 m em 1 s
  check('teleporte descartado', tr.fixesAbsurdos === 1);
  check('teleporte não vira distância', tr.gpsDistanceM === 0);
});

comRelogio(clock => {
  // Andar de verdade durante um trecho de sinal ruim não pode sumir: quando um
  // fix bom volta, o deslocamento acumulado entra de uma vez.
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps+gps';
  let lat = -23.55;
  tr._onFix(fix(lat, -46.63, 8, clock.now));
  for (let i = 0; i < 5; i++) { clock.now += 4000; lat = north(lat, 8); tr._onFix(fix(lat, -46.63, 90, clock.now)); }
  clock.now += 4000; lat = north(lat, 8);
  tr._onFix(fix(lat, -46.63, 8, clock.now));
  check('trecho com sinal ruim não se perde', approx(tr.gpsDistanceM, 48, 1), `→ ${tr.gpsDistanceM.toFixed(1)}`);
});

console.log('\n— calibração da passada —');
comRelogio(clock => {
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps+gps';
  const PASSADA_REAL = 0.95;          // a pessoa anda mais que o padrão (0.78)
  const inicial = tr.stride;

  let lat = -23.55;
  tr._onFix(fix(lat, -46.63, 8, clock.now));

  // 600 passos reais: o GPS vê 0.95 m por passo, o jogo começa achando 0.78.
  for (let bloco = 0; bloco < 60; bloco++) {
    for (let i = 0; i < 10; i++) { clock.now += 500; tr._lastStepAt = clock.now; tr.step(500); }
    clock.now += 500;
    lat = north(lat, 10 * PASSADA_REAL);
    tr._onFix(fix(lat, -46.63, 8, clock.now));
  }

  check('passada partiu do padrão', approx(inicial, 0.78, 0.001));
  check('passada convergiu para a real', approx(tr.stride, PASSADA_REAL, 0.05), `→ ${tr.stride.toFixed(3)}`);
  check('marcada como aferida', tr.strideCalibrated === true);
  check('houve mais de um ajuste', tr.calibracoes > 1, `→ ${tr.calibracoes}`);

  // Sem calibrar, 600 passos dariam 468 m contra 570 m reais: 18% de erro.
  const semCalibrar = 600 * inicial;
  const real = tr.gpsDistanceM;
  const erroAntes = Math.abs(semCalibrar - real) / real;
  const erroDepois = Math.abs(tr.distanceM - real) / real;
  check('erro da distância caiu', erroDepois < erroAntes / 2,
    `→ ${(erroAntes * 100).toFixed(0)}% para ${(erroDepois * 100).toFixed(0)}%`);
});

console.log('\n— calibração rejeita valores absurdos —');
comRelogio(clock => {
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps+gps';
  const inicial = tr.stride;
  let lat = -23.55;
  tr._onFix(fix(lat, -46.63, 8, clock.now));

  // Carro/ônibus: muito deslocamento, poucos passos → passada absurda.
  for (let i = 0; i < 30; i++) { clock.now += 500; tr._lastStepAt = clock.now; tr.step(500); }
  clock.now += 1000;
  lat = north(lat, 200);                   // 200 m com 30 passos = 6.7 m/passo
  tr._onFix(fix(lat, -46.63, 8, clock.now));
  check('passada absurda ignorada', tr.stride === inicial, `→ ${tr.stride.toFixed(3)}`);
});

console.log('\n— relatório final —');
{
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps+gps';
  tr.gpsDistanceM = 5000; tr.distanceM = 4800;
  check('reporta a distância do GPS', tr.reportedDistanceM === 5000);
  check('média km/h de 5 km em 30 min', approx(tr.avgSpeedKmh(1800), 10, 0.01), `→ ${tr.avgSpeedKmh(1800)}`);

  const semGps = new Tracker();
  semGps.distanceM = 4800;
  check('sem GPS reporta a dos passos', semGps.reportedDistanceM === 4800);
}

console.log('\n— formatação —');
check('10 km/h → 10.0', formatKmh(10) === '10.0', `→ ${formatKmh(10)}`);
check('zero → --', formatKmh(0) === '--');
check('tempo 3661 s → 1:01:01', formatTime(3661) === '1:01:01', `→ ${formatTime(3661)}`);
check('tempo 125 s → 02:05', formatTime(125) === '02:05', `→ ${formatTime(125)}`);
check('tempo negativo → 00:00', formatTime(-5) === '00:00');

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
