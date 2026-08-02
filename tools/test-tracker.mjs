// Testes da lógica de distância real (sem navegador): alimenta o Tracker com
// fixes de GPS sintéticos e confere acumulação, filtros e ritmo.
import { Tracker, haversine, formatPace, formatTime } from '../js/tracker.js';

let pass = 0, fail = 0;
const approx = (a, b, tol) => Math.abs(a - b) <= tol;

function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FALHA ${name} ${detail}`); }
}

// Um fix falso; `t` em ms.
const fix = (lat, lon, acc, t) => ({ coords: { latitude: lat, longitude: lon, accuracy: acc }, timestamp: t });

// Desloca `metros` para o norte a partir de uma latitude.
const north = (lat, m) => lat + (m / 111320);

console.log('\n— haversine —');
check('1 grau de latitude ~ 111.19 km',
  approx(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }), 111194, 50));
check('mesmo ponto = 0 m',
  haversine({ lat: -23.55, lon: -46.63 }, { lat: -23.55, lon: -46.63 }) === 0);
check('100 m ao norte',
  approx(haversine({ lat: -23.55, lon: -46.63 }, { lat: north(-23.55, 100), lon: -46.63 }), 100, 1));

console.log('\n— acumulação em linha reta —');
{
  const tr = new Tracker();
  tr.running = true; tr.mode = 'gps';

  // A velocidade agora vem da janela deslizante, atualizada no tick — então o
  // teste precisa rodar o loop do jogo, não só entregar fixes.
  let now = 1000;
  const realNow = performance.now.bind(performance);
  performance.now = () => now;

  let lat = -23.55;
  tr._onFix(fix(lat, -46.63, 8, now));            // primeiro fix: só referência
  // 100 trechos de 10 m a cada 3 s → 3,33 m/s
  for (let i = 0; i < 100; i++) {
    for (let k = 0; k < 180; k++) { now += 1000 / 60; tr.tick(1 / 60); }
    lat = north(lat, 10);
    tr._onFix(fix(lat, -46.63, 8, now));
  }
  performance.now = realNow;

  check('1000 m acumulados', approx(tr.distanceM, 1000, 5), `→ ${tr.distanceM.toFixed(1)}`);
  check('velocidade ~3.33 m/s', approx(tr.speedMs, 3.33, 0.6), `→ ${tr.speedMs.toFixed(2)}`);
  check('status ok', tr.status === 'ok');
}

console.log('\n— filtro de precisão —');
{
  const tr = new Tracker();
  tr.running = true; tr.mode = 'gps';
  let lat = -23.55, t = 1000;
  tr._onFix(fix(lat, -46.63, 8, t));
  // Fixes com precisão ruim (>30 m) devem ser ignorados.
  for (let i = 0; i < 10; i++) {
    lat = north(lat, 10); t += 3000;
    tr._onFix(fix(lat, -46.63, 90, t));
  }
  check('fixes imprecisos não acumulam', tr.distanceM === 0, `→ ${tr.distanceM}`);
}

console.log('\n— jitter parado —');
{
  const tr = new Tracker();
  tr.running = true; tr.mode = 'gps';
  const lat0 = -23.55; let t = 1000;
  tr._onFix(fix(lat0, -46.63, 6, t));
  // Oscila ±0.7 m em torno do mesmo ponto por 60 fixes.
  for (let i = 0; i < 60; i++) {
    t += 1000;
    tr._onFix(fix(north(lat0, (i % 2 ? 0.7 : -0.7)), -46.63, 6, t));
  }
  check('parado não acumula distância', tr.distanceM === 0, `→ ${tr.distanceM.toFixed(2)}`);
}

console.log('\n— caminhada lenta acumula —');
{
  const tr = new Tracker();
  tr.running = true; tr.mode = 'gps';
  let lat = -23.55, t = 1000;
  tr._onFix(fix(lat, -46.63, 6, t));
  // 1 m por fix: abaixo do limiar de jitter (1.5 m) isoladamente, mas a
  // referência não se move, então dois fixes seguidos já passam do limiar.
  for (let i = 0; i < 100; i++) {
    lat = north(lat, 1); t += 1000;
    tr._onFix(fix(lat, -46.63, 6, t));
  }
  check('~100 m em passos de 1 m', approx(tr.distanceM, 100, 4), `→ ${tr.distanceM.toFixed(1)}`);
}

console.log('\n— salto impossível é descartado —');
{
  const tr = new Tracker();
  tr.running = true; tr.mode = 'gps';
  let t = 1000;
  tr._onFix(fix(-23.55, -46.63, 6, t));
  t += 1000;
  tr._onFix(fix(north(-23.55, 500), -46.63, 6, t));   // 500 m em 1 s = 500 m/s
  check('teleporte não conta', tr.distanceM === 0, `→ ${tr.distanceM.toFixed(1)}`);
}

console.log('\n— pedômetro —');
{
  const tr = new Tracker();
  tr.running = true; tr.mode = 'steps'; tr.stride = 0.8;
  // Simula 100 passos: pico e vale alternados, 500 ms entre passos.
  let now = 0;
  const realNow = performance.now.bind(performance);
  performance.now = () => now;
  const accel = v => tr._onAccel({ accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 + v } });
  for (let i = 0; i < 200; i++) accel(0);          // estabiliza a gravidade
  for (let i = 0; i < 100; i++) {
    now += 250; accel(3.0);                        // pico
    now += 250; accel(-2.0);                       // vale
  }
  performance.now = realNow;
  check('100 passos contados', tr.steps === 100, `→ ${tr.steps}`);
  check('distância = passos x passada', approx(tr.distanceM, 80, 0.01), `→ ${tr.distanceM.toFixed(2)}`);
}

// Reproduz o caso do celular: caminhada a 1,3 m/s com fix a cada segundo.
// Cada fix isolado anda ~1,3 m, ABAIXO do limiar de jitter (1,5 m) — era isso
// que zerava a velocidade e deixava o herói parado com o fundo pulando.
console.log('\n— caminhada lenta: herói não pode parar —');
{
  const tr = new Tracker();
  tr.mode = 'gps'; tr.running = true;

  let now = 1000;
  const realNow = performance.now.bind(performance);
  performance.now = () => now;

  let lat = -23.55;
  tr._onFix(fix(lat, -46.63, 8, now));

  let minDisplay = Infinity, framesParado = 0, total = 0;
  for (let s = 0; s < 40; s++) {
    for (let k = 0; k < 60; k++) {
      now += 1000 / 60;
      tr.tick(1 / 60);
      if (s >= 8) {                       // depois da janela encher
        total++;
        minDisplay = Math.min(minDisplay, tr.displaySpeedMs);
        if (!tr.moving) framesParado++;
      }
    }
    lat = north(lat, 1.3);
    tr._onFix(fix(lat, -46.63, 8, now));
  }
  performance.now = realNow;

  check('distância acumulada ~52 m', approx(tr.distanceM, 52, 3), `→ ${tr.distanceM.toFixed(1)}`);
  check('nunca deixou de estar em movimento', framesParado === 0, `→ ${framesParado}/${total} frames parado`);
  check('velocidade de exibição nunca zerou', minDisplay >= 0.9, `→ min ${minDisplay.toFixed(2)} m/s`);
  check('ritmo do HUD não fica --:--', isFinite(tr.paceMinKm), `→ ${formatPace(tr.paceMinKm)}`);
}

console.log('\n— parar de verdade encerra o movimento —');
{
  const tr = new Tracker();
  tr.mode = 'gps'; tr.running = true;
  let now = 1000;
  const realNow = performance.now.bind(performance);
  performance.now = () => now;

  let lat = -23.55;
  tr._onFix(fix(lat, -46.63, 8, now));
  for (let s = 0; s < 15; s++) {
    for (let k = 0; k < 60; k++) { now += 1000 / 60; tr.tick(1 / 60); }
    lat = north(lat, 3);
    tr._onFix(fix(lat, -46.63, 8, now));
  }
  check('estava em movimento', tr.moving === true);

  // Para: sem novos fixes e sem passos.
  let parouApos = -1;
  for (let s = 0; s < 20 && parouApos < 0; s++) {
    for (let k = 0; k < 60; k++) {
      now += 1000 / 60;
      tr.tick(1 / 60);
      if (!tr.moving && parouApos < 0) parouApos = (now - 1000) / 1000 - 15;
    }
  }
  performance.now = realNow;
  check('herói parou em poucos segundos', parouApos > 0 && parouApos < 9, `→ ${parouApos.toFixed(1)} s`);
  check('velocidade de exibição zerou', tr.displaySpeedMs === 0);
}

console.log('\n— acelerômetro sozinho já põe em movimento —');
{
  const tr = new Tracker();
  tr.mode = 'gps'; tr.running = true;   // GPS sem nenhum fix ainda
  let now = 1000;
  const realNow = performance.now.bind(performance);
  performance.now = () => now;

  const accel = v => tr._onAccel({ accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 + v } });
  for (let i = 0; i < 200; i++) accel(0);
  for (let i = 0; i < 6; i++) { now += 300; accel(3.0); now += 300; accel(-2.0); tr.tick(1 / 60); }
  const moveuSemGps = tr.moving;
  const semDistancia = tr.distanceM === 0;
  performance.now = realNow;

  check('entra em movimento sem nenhum fix de GPS', moveuSemGps === true);
  check('no modo GPS o passo não inventa distância', semDistancia, `→ ${tr.distanceM}`);
}

console.log('\n— formatação —');
check('ritmo 5.5 min/km → 05:30', formatPace(5.5) === '05:30', `→ ${formatPace(5.5)}`);
check('ritmo infinito → --:--', formatPace(Infinity) === '--:--');
check('tempo 3661 s → 1:01:01', formatTime(3661) === '1:01:01', `→ ${formatTime(3661)}`);
check('tempo 125 s → 02:05', formatTime(125) === '02:05', `→ ${formatTime(125)}`);
check('tempo negativo → 00:00', formatTime(-5) === '00:00');

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
