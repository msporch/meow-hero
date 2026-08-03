// Service worker do Meow Hero — cache-first do shell, para o jogo funcionar
// offline (importante: durante a corrida a conexão pode cair).
// Suba esta versão a cada mudança de código ou asset: o cache é cache-first,
// então sem isso um app já instalado continuaria servindo os arquivos antigos.
const VERSION = 'meowhero-v6';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/game.js',
  './js/gfx.js',
  './js/font.js',
  './js/assets.js',
  './js/audio.js',
  './js/config.js',
  './js/course.js',
  './js/tracker.js',
  './js/storage.js',
  './js/multiplayer.js',
  './assets/atlas.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

/**
 * A lista de sprites vem do próprio atlas.json, e não de uma cópia fixa aqui —
 * assim o cache offline acompanha automaticamente qualquer asset novo gerado
 * pelo pipeline do PixelLab, sem risco de a lista sair de sincronia.
 */
async function spriteUrls() {
  try {
    const res = await fetch('./assets/atlas.json', { cache: 'no-cache' });
    const atlas = await res.json();
    const files = new Set();
    for (const s of Object.values(atlas.sprites || {})) if (s.file) files.add(`./assets/${s.file}`);
    for (const a of Object.values(atlas.anims || {})) if (a.file) files.add(`./assets/${a.file}`);
    return [...files];
  } catch {
    return [];
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    const urls = [...SHELL, ...await spriteUrls()];
    // addAll falha inteiro se um arquivo faltar; adiciona um a um para ser tolerante.
    await Promise.all(urls.map(url => cache.add(url).catch(() => { /* opcional */ })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) {
      // Revalida em segundo plano, sem travar a resposta.
      fetch(request).then(res => {
        if (res && res.ok) caches.open(VERSION).then(c => c.put(request, res.clone()));
      }).catch(() => { /* offline */ });
      return cached;
    }

    try {
      const res = await fetch(request);
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(VERSION).then(c => c.put(request, clone));
      }
      return res;
    } catch {
      // Navegação offline sem cache → volta para o index.
      if (request.mode === 'navigate') {
        const fallback = await caches.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    }
  })());
});
