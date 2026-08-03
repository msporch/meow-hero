// Invólucro Node do servidor de multijogador — o que roda no seu PC.
// A lógica está em core.mjs, compartilhada com a versão Cloudflare.
//
//   node server/node.mjs [porta]
//
// Para o celular alcançar, exponha por túnel HTTPS (ver README).
import http from 'node:http';
import { Presence, handle, CORS } from './core.mjs';

const PORT = Number(process.argv[2] || process.env.PORT || 3000);
const presence = new Presence();

function send(res, status, json) {
  const body = JSON.stringify(json);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...CORS,
  });
  res.end(body);
}

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  let raw = '';
  let grande = false;
  req.on('data', c => {
    raw += c;
    // A entrada vem da rede: corta payload absurdo antes de tentar interpretar.
    if (raw.length > 4096) { grande = true; req.destroy(); }
  });

  req.on('end', () => {
    if (grande) return;
    let body = null;
    if (raw) {
      try { body = JSON.parse(raw); }
      catch { return send(res, 400, { error: 'json invalido' }); }
    }
    const r = handle(presence, { method: req.method, path: pathname, body });
    send(res, r.status, r.json);
  });
}).listen(PORT, () => {
  console.log(`Servidor de multijogador em http://localhost:${PORT}`);
  console.log('Rotas: POST /api/presence   GET /api/health');
  console.log('\nPara o celular alcançar, em outro terminal:');
  console.log(`  npx cloudflared tunnel --url http://localhost:${PORT}`);
});
