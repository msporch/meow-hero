// Progressão persistente: moedas do cofrinho, gatos salvos e histórico.
import { SAVE_KEY } from './config.js';

const EMPTY = {
  coins: 0,          // moedas acumuladas em todas as corridas
  completadas: 0,   // corridas em que a meta foi cumprida
  runs: [],          // últimas corridas (máx. 20)
  bestKm: 0,
  totalKm: 0,
  audio: true,
  scanlines: true,
  stride: 0.78,
  lastGoal: 5,
  lastDiff: 'normal',
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
export function recordRun({ goalKm, distanceM, seconds, coins, completou, mode }) {
  const d = load();
  d.coins += coins;
  d.totalKm += distanceM / 1000;
  if (completou) d.completadas++;
  if (distanceM / 1000 > d.bestKm) d.bestKm = distanceM / 1000;
  d.runs.unshift({
    at: Date.now(),
    goalKm, distanceM: Math.round(distanceM), seconds: Math.round(seconds), coins, completou, mode,
  });
  d.runs = d.runs.slice(0, 20);

  save();
  return d;
}

export function resetAll() {
  data = vazio();
  save();
}
