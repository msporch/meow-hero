// Serve o projeto sob um subcaminho, imitando o GitHub Pages
// (https://usuario.github.io/<repo>/). Usado para verificar que manifest,
// service worker e assets resolvem certo fora da raiz do domínio.
//   node tools/serve-subpath.mjs [prefixo] [porta]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = '/' + (process.argv[2] || 'meow-hero').replace(/^\/|\/$/g, '');
const PORT = Number(process.argv[3] || 8081);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
};

http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);

  if (!pathname.startsWith(PREFIX)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`fora de ${PREFIX}`);
    return;
  }

  let rel = pathname.slice(PREFIX.length) || '/';
  if (rel === '/' || rel === '') rel = '/index.html';

  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`Simulando GitHub Pages em http://localhost:${PORT}${PREFIX}/`);
});
