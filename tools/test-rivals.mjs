// Testes da apresentação dos rivais no multijogador.
//
// Cobrem exatamente o defeito relatado: o rival ficava colado num ponto fixo
// quando a distância passava do teto, e não saía de tela ao se afastar nem ao
// sumir do servidor.
import { RivalSet } from '../js/multiplayer.js';
import { W, HERO_X, MP_VISIBLE_M, MP_MIN_OFFSET } from '../js/config.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FALHA ${name} ${detail}`); }
}

const jogador = (id, distM, aheadM = 100) => ({ id, distM, aheadM, goalKm: 5 });
/** Roda o deslize até estabilizar. */
const assentar = (rs, s = 6) => { for (let i = 0; i < s * 60; i++) rs.tick(1 / 60); };

console.log('\n— distância vira posição, sem saturar —');
{
  const perto = RivalSet.offsetFor(20);
  const medio = RivalSet.offsetFor(150);
  const longe = RivalSet.offsetFor(290);
  check('mais longe = mais afastado', perto < medio && medio < longe,
    `→ ${perto.toFixed(0)} ${medio.toFixed(0)} ${longe.toFixed(0)}`);
  check('nunca encosta no herói', perto >= MP_MIN_OFFSET, `→ ${perto.toFixed(0)}`);

  // Era aqui que travava: qualquer distância acima do teto dava o mesmo ponto.
  const a = RivalSet.offsetFor(MP_VISIBLE_M + 50);
  const b = RivalSet.offsetFor(MP_VISIBLE_M + 500);
  check('não satura num ponto fixo', a !== b, `→ ${a.toFixed(0)} vs ${b.toFixed(0)}`);
  check('longe demais já sai de quadro', HERO_X + RivalSet.offsetFor(MP_VISIBLE_M) > W,
    `→ ${(HERO_X + RivalSet.offsetFor(MP_VISIBLE_M)).toFixed(0)} > ${W}`);
}

console.log('\n— lado indica quem está à frente —');
{
  const rs = new RivalSet();
  rs.sync([jogador('frente', 100, +200), jogador('atras', 100, -200)]);
  assentar(rs);
  const f = rs.rivals.get('frente'), a = rs.rivals.get('atras');
  check('quem lidera fica à direita', f.x > HERO_X, `→ ${f.x.toFixed(0)}`);
  check('quem está atrás fica à esquerda', a.x < HERO_X, `→ ${a.x.toFixed(0)}`);
}

console.log('\n— entra deslizando, não teleporta —');
{
  const rs = new RivalSet();
  rs.sync([jogador('novo', 80)]);
  const inicial = rs.rivals.get('novo').x;
  check('entra pela borda', Math.abs(inicial - HERO_X) > W / 2, `→ ${inicial.toFixed(0)}`);

  rs.tick(1 / 60);
  const passo = Math.abs(rs.rivals.get('novo').x - inicial);
  check('anda pouco por frame', passo < 12, `→ ${passo.toFixed(1)} px`);

  assentar(rs);
  const alvo = HERO_X + RivalSet.offsetFor(80);
  check('chega ao lugar certo', Math.abs(rs.rivals.get('novo').x - alvo) < 1.5,
    `→ ${rs.rivals.get('novo').x.toFixed(1)} vs ${alvo.toFixed(1)}`);
}

console.log('\n— afastar-se leva para fora de quadro —');
{
  const rs = new RivalSet();
  rs.sync([jogador('r', 60)]);
  assentar(rs);
  check('visível de perto', rs.visible().length === 1);

  // A pessoa se afasta aos poucos.
  for (const d of [120, 200, 280, 400]) { rs.sync([jogador('r', d)]); assentar(rs, 3); }
  check('sumiu da tela ao se afastar', rs.visible().length === 0, `→ ${rs.visible().length}`);
  check('descartado da memória', rs.rivals.size === 0, `→ ${rs.rivals.size}`);
}

console.log('\n— sair do servidor faz sair correndo —');
{
  const rs = new RivalSet();
  rs.sync([jogador('some', 70)]);
  assentar(rs);
  const antes = rs.rivals.get('some').x;
  check('estava na tela', rs.visible().length === 1 && antes > 0 && antes < W);

  rs.sync([]);                       // não veio na resposta seguinte
  check('marcado como saindo', rs.rivals.get('some').saindo === true);

  rs.tick(1 / 60);
  const depois = rs.rivals.get('some').x;
  check('sai andando, não some no ar', depois !== antes && Math.abs(depois - antes) < 12,
    `→ ${antes.toFixed(1)} para ${depois.toFixed(1)}`);

  assentar(rs, 8);
  check('acabou saindo da tela', rs.visible().length === 0, `→ ${rs.visible().length}`);
  check('descartado da memória', rs.rivals.size === 0, `→ ${rs.rivals.size}`);
}

console.log('\n— quem volta a aparecer não é duplicado —');
{
  const rs = new RivalSet();
  rs.sync([jogador('x', 80)]);
  assentar(rs, 1);
  rs.sync([]);                       // sumiu por uma resposta
  rs.tick(1 / 60);
  rs.sync([jogador('x', 80)]);       // voltou
  check('continua sendo um só', rs.rivals.size === 1, `→ ${rs.rivals.size}`);
  check('cancelou a saída', rs.rivals.get('x').saindo === false);
}

console.log('\n— teto de rivais na tela —');
{
  const rs = new RivalSet();
  rs.sync([jogador('a', 30), jogador('b', 60), jogador('c', 90), jogador('d', 120)]);
  assentar(rs);
  check('respeita o limite pedido', rs.visible(2).length === 2);
  check('mais próximos primeiro', rs.visible(2)[0].distM === 30);
  check('sem limite devolve todos na tela', rs.visible().length === 4, `→ ${rs.visible().length}`);
}

console.log(`\n${pass} passaram, ${fail} falharam\n`);
process.exit(fail ? 1 : 0);
