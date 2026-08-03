// Progressão persistente: moedas do cofrinho, gatos salvos e histórico de corridas.
import { SAVE_KEY } from './config.js';

const EMPTY = {
  coins: 0,          // moedas acumuladas em todas as corridas
  catsSaved: 0,
  runs: [],          // últimas corridas (máx. 20)
  bestKm: 0,
  totalKm: 0,
  audio: true,
  scanlines: true,
  stride: 0.78,
  lastGoal: 5,
  lastPace: 8,
  lastMode: 'steps+gps',
};

let data = null;

export function load() {
  if (data) return data;
  try {
    data = { ...EMPTY, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
  } catch {
    data = { ...EMPTY };
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
export function recordRun({ goalKm, distanceM, seconds, coins, saved, mode }) {
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
  save();
  return d;
}

export function resetAll() {
  data = { ...EMPTY };
  save();
}
