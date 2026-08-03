// Som estilo Game Boy: ondas quadradas via WebAudio + vibração.
// Como o celular fica no bolso, o áudio e o háptico são o principal retorno da corrida.

let actx = null;
let master = null;
let enabled = true;
let hapticsOn = true;

export function initAudio() {
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  actx = new AC();
  master = actx.createGain();
  master.gain.value = 0.22;
  master.connect(actx.destination);
  return actx;
}

/** Precisa ser chamado a partir de um gesto do usuário. */
export function resumeAudio() {
  if (!actx) initAudio();
  if (actx?.state === 'suspended') actx.resume();
}

export function setAudioEnabled(v) { enabled = v; }
export function isAudioEnabled() { return enabled; }

/**
 * Vibração é controlada à parte do som: com o celular no bolso, muita gente
 * quer o retorno tátil sem barulho — ou o contrário, correndo com fone.
 */
export function setHapticsEnabled(v) { hapticsOn = v; }
export function isHapticsEnabled() { return hapticsOn; }

/** Um bip de onda quadrada. */
function beep(freq, dur, { type = 'square', vol = 1, delay = 0, slideTo = null } = {}) {
  if (!enabled || !actx) return;
  const t0 = actx.currentTime + delay;
  const osc = actx.createOscillator();
  const g = actx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);

  // Envelope curto e seco, como o canal de pulso do GB.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  osc.connect(g); g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function seq(notes) {
  let t = 0;
  for (const [freq, dur, vol = 1] of notes) {
    beep(freq, dur, { delay: t, vol });
    t += dur * 0.92;
  }
}

export function vibrate(pattern) {
  if (!hapticsOn) return;
  try { navigator.vibrate?.(pattern); } catch { /* sem suporte */ }
}

// ---------- Efeitos ----------
export const sfx = {
  coin()      { beep(1050, 0.05, { vol: .7 }); beep(1560, 0.09, { delay: .045, vol: .6 }); },
  milk()      { seq([[660, .07], [880, .07], [1180, .13]]); vibrate(40); },
  select()    { beep(720, 0.05, { vol: .8 }); },
  confirm()   { seq([[600, .06], [900, .1]]); },
  back()      { beep(420, 0.08, { vol: .7, slideTo: 260 }); },

  /** Marco de quilômetro — dois bips altos + vibração dupla. */
  km(n) {
    seq([[880, .09], [1180, .09], [1480, .16]]);
    vibrate([60, 70, 60]);
    void n;
  },

  halfway()   { seq([[740, .1], [740, .1], [990, .18]]); vibrate([50, 60, 50, 60, 50]); },
  lowTime()   { seq([[520, .12], [440, .12], [370, .2]]); vibrate([120, 80, 120]); },

  /** Vitória: o gato foi salvo. */
  win() {
    seq([[523, .12], [659, .12], [784, .12], [1047, .3]]);
    vibrate([80, 60, 80, 60, 220]);
  },

  /** Derrota: o tempo acabou. */
  lose() {
    seq([[440, .18], [370, .18], [294, .18], [220, .42]]);
    vibrate([300, 120, 300]);
  },

  start()     { seq([[392, .09], [523, .09], [659, .09], [784, .2]]); vibrate(80); },
  pause()     { beep(600, .06); beep(400, .09, { delay: .06 }); },
};
