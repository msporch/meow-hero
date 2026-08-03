// Testes do servidor de multijogador. Cobrem sobretudo a promessa de
// privacidade: nenhuma coordenada pode sair na resposta.
import { Presence, handle, sanitize, haversine } from '../server/core.mjs';

let pass = 0, fail = 0;
const approx = (a, b, tol) => Math.abs(a - b) <= tol;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FALHA ${name} ${detail}`); }
}

const ID_A = 'aaaaaaaaaaaa1111';
const ID_B = 'bbbbbbbbbbbb2222';
const ID_C = 'cccccccccccc3333';
const norte = (lat, m) => lat + (m / 111320);
const entrada = (id, lat, runM) => ({ id, lat, lon: -46.63, runM, goalKm: 5 });

console.log('\n— validação da entrada —');
check('entrada boa passa', sanitize(entrada(ID_A, -23.55, 100)) !== null);
check('id curto rejeitado', sanitize({ ...entrada(ID_A, -23.55, 0), id: 'x' }) === null);
check('id com caractere estranho rejeitado', sanitize({ ...entrada(ID_A, -23.55, 0), id: '../../etc/passwd' }) === null);
check('latitude fora de faixa rejeitada', sanitize({ ...entrada(ID_A, 200, 0) }) === null);
check('longitude fora de faixa rejeitada', sanitize({ ...entrada(ID_A, -23.55, 0), lon: 999 }) === null);
check('distância negativa rejeitada', sanitize(entrada(ID_A, -23.55, -5)) === null);
check('corpo vazio rejeitado', sanitize(null) === null);
check('texto no lugar de objeto rejeitado', sanitize('oi') === null);
check('meta absurda vira null sem derrubar', sanitize({ ...entrada(ID_A, -23.55, 0), goalKm: 9999 })?.goalKm === null);

console.log('\n— proximidade —');
{
  const p = new Presence({ radiusM: 1000 });
  p.update(sanitize(entrada(ID_A, -23.55, 500)));
  const viz = p.update(sanitize(entrada(ID_B, norte(-23.55, 300), 800)));

  check('encontra quem está a 300 m', viz.length === 1 && approx(viz[0].distM, 300, 2), `→ ${JSON.stringify(viz)}`);
  check('informa quem está à frente', viz[0].aheadM === -300, `→ ${viz[0].aheadM}`);

  const longe = p.update(sanitize(entrada(ID_C, norte(-23.55, 5000), 100)));
  check('quem está longe não aparece', longe.length === 0, `→ ${longe.length}`);
}

console.log('\n— privacidade: coordenada nunca sai —');
{
  const p = new Presence();
  p.update(sanitize(entrada(ID_A, -23.55, 500)));
  const viz = p.update(sanitize(entrada(ID_B, norte(-23.55, 100), 700)));
  const bruto = JSON.stringify(viz);

  check('resposta não traz lat', !('lat' in viz[0]), `→ ${bruto}`);
  check('resposta não traz lon', !('lon' in viz[0]));
  check('nenhuma coordenada no json', !bruto.includes('23.5') && !bruto.includes('46.6'), `→ ${bruto}`);
  check('só campos previstos', Object.keys(viz[0]).sort().join(',') === 'aheadM,distM,goalKm,id');
}

console.log('\n— jogador some quando para de enviar —');
{
  const p = new Presence({ ttlMs: 10000 });
  let agora = 1000;
  p.update(sanitize(entrada(ID_A, -23.55, 0)), agora);
  p.update(sanitize(entrada(ID_B, norte(-23.55, 50), 0)), agora);
  check('os dois online', p.size === 2);

  agora += 20000;   // B some, A continua enviando
  const viz = p.update(sanitize(entrada(ID_A, -23.55, 100)), agora);
  check('vizinho expirado não aparece', viz.length === 0, `→ ${viz.length}`);
  check('expirado removido da memória', p.size === 1, `→ ${p.size}`);
}

console.log('\n— roteador —');
{
  const p = new Presence();
  check('health responde', handle(p, { method: 'GET', path: '/api/health' }).status === 200);
  check('presence exige POST', handle(p, { method: 'GET', path: '/api/presence' }).status === 405);
  check('corpo inválido dá 400', handle(p, { method: 'POST', path: '/api/presence', body: { id: 'x' } }).status === 400);
  check('rota desconhecida dá 404', handle(p, { method: 'GET', path: '/qualquer' }).status === 404);

  const ok = handle(p, { method: 'POST', path: '/api/presence', body: entrada(ID_A, -23.55, 10) });
  check('presence válido dá 200', ok.status === 200 && ok.json.ok === true);
  check('devolve lista de jogadores', Array.isArray(ok.json.players));
}

console.log('\n— teto de vizinhos —');
{
  const p = new Presence({ maxPlayers: 3 });
  for (let i = 0; i < 10; i++) {
    p.update(sanitize(entrada(`jogador${String(i).padStart(9, '0')}`, norte(-23.55, i * 20), 0)));
  }
  const viz = p.update(sanitize(entrada(ID_A, -23.55, 0)));
  check('devolve no máximo o teto', viz.length === 3, `→ ${viz.length}`);
  check('mais próximos primeiro', viz[0].distM <= viz[1].distM && viz[1].distM <= viz[2].distM);
}

console.log('\n— haversine do servidor bate com o do cliente —');
check('100 m ao norte', approx(haversine({ lat: -23.55, lon: -46.63 }, { lat: norte(-23.55, 100), lon: -46.63 }), 100, 1));

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
