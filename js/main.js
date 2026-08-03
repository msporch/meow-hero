// Ponto de entrada: canvas, entrada, loop, service worker e instalação.
import { W, H } from './config.js';
import { initGfx, ctx, clear } from './gfx.js';
import { drawText } from './font.js';
import { loadAssets, A } from './assets.js';
import { initAudio, resumeAudio, setAudioEnabled, sfx } from './audio.js';
import { Game } from './game.js';
import { captureServerFromUrl } from './multiplayer.js';
import * as store from './storage.js';

const canvas = document.getElementById('screen');
initGfx(canvas);

// ---------- tela de carregamento ----------
clear(3);
drawText(ctx, 'MEOW HERO', W / 2, 60, 0, 'center');
drawText(ctx, 'CARREGANDO...', W / 2, 76, 1, 'center');

// Precisa vir antes do jogo: é daqui que sai o endereço do servidor de
// multijogador, passado uma única vez por ?mp=... na URL.
captureServerFromUrl();

const game = new Game();
let ready = false;

// ---------- entrada ----------
const KEYMAP = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
  z: 'a', ' ': 'a', Enter: 'start', x: 'b', Backspace: 'b',
  Shift: 'select', Escape: 'b',
};

function send(key) {
  if (!ready) return;
  game.input(key);
}

window.addEventListener('keydown', e => {
  const k = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
  if (!k) return;
  e.preventDefault();
  send(k);
});

/** Liga um elemento a uma tecla virtual, com feedback visual. */
function bindButton(el, key) {
  if (!el) return;
  const press = e => {
    e.preventDefault();
    el.classList.add('on');
    send(key);
  };
  const release = () => el.classList.remove('on');
  el.addEventListener('pointerdown', press);
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('contextmenu', e => e.preventDefault());
}

bindButton(document.getElementById('btn-a'), 'a');
bindButton(document.getElementById('btn-b'), 'b');
bindButton(document.getElementById('btn-start'), 'start');
bindButton(document.getElementById('btn-select'), 'select');
bindButton(document.getElementById('dp-up'), 'up');
bindButton(document.getElementById('dp-down'), 'down');
bindButton(document.getElementById('dp-left'), 'left');
bindButton(document.getElementById('dp-right'), 'right');

// Toque na própria tela.
canvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  send('tap');
});

// ---------- wake lock volta ao reativar a aba ----------
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') game.reacquireWakeLock();
});

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  // dt limitado: se a aba dormiu, não teleporta o jogo.
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (ready) {
    game.update(dt);
    game.draw();
  }
  requestAnimationFrame(frame);
}

// ---------- inicialização ----------
(async () => {
  await loadAssets();
  initAudio();
  setAudioEnabled(store.get('audio') !== false);
  if (store.get('scanlines') === false) document.body.classList.add('no-scanlines');

  if (A.missing.length) {
    console.warn('Assets ausentes:', A.missing);
  }

  ready = true;
  requestAnimationFrame(frame);
})();

// Áudio só pode iniciar a partir de um gesto.
['pointerdown', 'keydown'].forEach(ev =>
  window.addEventListener(ev, () => resumeAudio(), { once: true }));

// ---------- service worker ----------
// ?dev=1 desliga o cache offline e remove um SW já instalado — sem isso, cada
// recarga durante o desenvolvimento serve a versão antiga do código.
const DEV = new URLSearchParams(location.search).has('dev');

if ('serviceWorker' in navigator) {
  if (DEV) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    caches?.keys?.().then(ks => ks.forEach(k => caches.delete(k)));
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
    });
  }
}

// ---------- instalação ----------
const bar = document.getElementById('install-bar');
let deferred = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferred = e;
  if (localStorage.getItem('meowhero.install.dismissed') !== '1') bar.hidden = false;
});

document.getElementById('install-yes')?.addEventListener('click', async () => {
  bar.hidden = true;
  if (!deferred) return;
  deferred.prompt();
  await deferred.userChoice;
  deferred = null;
});

document.getElementById('install-no')?.addEventListener('click', () => {
  bar.hidden = true;
  localStorage.setItem('meowhero.install.dismissed', '1');
});

window.addEventListener('appinstalled', () => { bar.hidden = true; deferred = null; });

// Exposto para depuração no console.
window.MEOW = { game, store, sfx };
