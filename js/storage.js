// Progressão persistente: moedas do cofrinho, gatos salvos, histórico e o
// traçado da melhor corrida de cada meta (usado pelo fantasma).
import { SAVE_KEY, GHOST_TRACE_S } from './config.js';

const EMPTY = {
  coins: 0,          // moedas acumuladas em todas as corridas
  catsSaved: 0,
  runs: [],          // últimas corridas (máx. 20)
  ghosts: {},        // meta em km → melhor corrida com traçado
  bestKm: 0,
  totalKm: 0,
  audio: true,
  scanlines: true,
  ghostOn: true,
  stride: 0.78,
  lastGoal: 5,
  lastPace: 8,
  lastMode: 'steps+gps',
};

let data = null;

/**
 * Cópia profunda dos valores padrão.
 *
 * `{ ...EMPTY }` copiaria `runs` e `ghosts` por referência, e o unshift do
 * histórico acabaria mutando o próprio objeto padrão — o progresso "resetado"
 * voltaria na chamada seguinte.
 */
const vazio = () => JSON.parse(JSON.stringify(EMPTY));

export function load() {
  if (data) return data;
  try {
    data = { ...vazio(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    data = vazio();
  }
  return data;
}

export function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch { /* modo privado */ }
}

export function get(key) { return load()[key]; }

export function set(key, value) {
  load()[key] = value;
  save();
}

/** Registra uma corrida terminada. */
export function recordRun({ goalKm, distanceM, seconds, coins, saved, mode, trace }) {
  const d = load();
  d.coins += coins;
  d.totalKm += distanceM / 1000;
  if (saved) d.catsSaved++;
  if (distanceM / 1000 > d.bestKm) d.bestKm = distanceM / 1000;
  d.runs.unshift({
    at: Date.now(),
    goalKm, distanceM: Math.round(distanceM), seconds: Math.round(seconds), coins, saved, mode,
  });
  d.runs = d.runs.slice(0, 20);

  if (trace && trace.length > 1) saveGhost({ goalKm, distanceM, seconds, saved, trace });
  save();
  return d;
}

/**
 * Guarda o traçado se esta corrida for melhor que a registrada para a meta.
 *
 * "Melhor" é: completou e foi mais rápida; ou, entre duas incompletas, foi
 * mais longe. Uma corrida completa sempre supera uma incompleta.
 */
function saveGhost(run) {
  const d = load();
  const chave = String(run.goalKm);
  const atual = d.ghosts[chave];

  const melhor = !atual
    || (run.saved && !atual.saved)
    || (run.saved === atual.saved && (run.saved
      ? run.seconds < atual.seconds
      : run.distanceM > atual.distanceM));

  if (!melhor) return;

  d.ghosts[chave] = {
    at: Date.now(),
    goalKm: run.goalKm,
    distanceM: Math.round(run.distanceM),
    seconds: Math.round(run.seconds),
    saved: run.saved,
    intervalS: GHOST_TRACE_S,
    trace: run.trace.map(v => Math.round(v)),
  };
}

/** Fantasma disponível para uma meta, ou null. */
export function getGhost(goalKm) {
  return load().ghosts?.[String(goalKm)] ?? null;
}

/**
 * Distância do fantasma no instante `t` (segundos), interpolada entre amostras.
 * Depois do fim do traçado ele fica parado na distância final.
 */
export function ghostDistanceAt(ghost, t) {
  if (!ghost?.trace?.length) return null;
  const passo = ghost.intervalS || GHOST_TRACE_S;
  const i = t / passo;
  const a = Math.floor(i);
  if (a < 0) return ghost.trace[0];
  if (a >= ghost.trace.length - 1) return ghost.trace[ghost.trace.length - 1];
  const f = i - a;
  return ghost.trace[a] + (ghost.trace[a + 1] - ghost.trace[a]) * f;
}

export function clearGhosts() {
  load().ghosts = {};
  save();
}

export function resetAll() {
  data = vazio();
  save();
}
