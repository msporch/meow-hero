// Servidor estático simples para desenvolvimento.
//   node tools/serve.mjs [porta]
// Geolocalização e service worker exigem HTTPS ou localhost — localhost serve.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';

  // Endpoint de desenvolvimento: a página envia o canvas em base64 e o
  // servidor grava um PNG ampliado, para inspecionar o render de verdade.
  if (rel === '/__shot' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      try {
        const { png, name = 'shot', scale = 4 } = JSON.parse(body);
        const raw = Buffer.from(String(png).replace(/^data:image\/png;base64,/, ''), 'base64');
        const dir = path.join(ROOT, 'assets', '_raw', 'zoom');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, `${name}.raw.png`), raw);
        fs.writeFileSync(path.join(dir, `${name}.meta.json`), JSON.stringify({ scale }));
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"ok":true}');
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  const file = path.join(ROOT, rel);
  // Impede sair da raiz do projeto.
  if (!file.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`Meow Hero em http://localhost:${PORT}`);
  console.log('(Ctrl+C para parar)');
});
