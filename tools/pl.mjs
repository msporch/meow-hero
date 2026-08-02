// Cliente MCP (streamable HTTP) para o PixelLab.
// Uso:  node tools/pl.mjs <tool_name> '<json-args>'
//       import { call } from './pl.mjs'
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const URL_MCP = 'https://api.pixellab.ai/mcp';

function token() {
  if (process.env.PIXELLAB_TOKEN) return process.env.PIXELLAB_TOKEN;
  const f = path.join(HERE, '.pixellab-token');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  throw new Error('Defina PIXELLAB_TOKEN ou crie tools/.pixellab-token');
}

let id = 0;

async function rpc(method, params) {
  const res = await fetch(URL_MCP, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token()}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${raw.slice(0, 500)}`);

  // O servidor responde em SSE; extrai as linhas "data:".
  const payload = raw.includes('data: ')
    ? raw.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('')
    : raw;

  const json = JSON.parse(payload);
  if (json.error) throw new Error(`MCP error: ${JSON.stringify(json.error)}`);
  return json.result;
}

/** Chama uma tool e devolve o texto concatenado do content. */
export async function call(name, args = {}) {
  const r = await rpc('tools/call', { name, arguments: args });
  const text = (r.content || [])
    .filter(c => c.type === 'text')
    .map(c => c.text)
    .join('\n');
  if (r.isError) throw new Error(`${name} falhou: ${text}`);
  return text;
}

/** Igual a call(), mas tenta devolver JSON quando o servidor responde JSON. */
export async function callJson(name, args = {}) {
  const text = await call(name, args);
  try { return JSON.parse(text); } catch { return text; }
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * O PixelLab limita a 8 jobs simultâneos e avisa de duas formas diferentes:
 * "rate limit exceeded (8/8 jobs)" e "need N job slots but only 0 available".
 */
export function isRateLimited(text) {
  const s = String(text);
  return /rate limit/i.test(s) || /job slots?\b/i.test(s) || /\(\d+\/\d+ (?:jobs|used)\)/i.test(s);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('pl.mjs')) {
  const [, , tool, argsJson] = process.argv;
  if (!tool) {
    console.error('uso: node tools/pl.mjs <tool> \'<json>\'');
    process.exit(1);
  }
  call(tool, argsJson ? JSON.parse(argsJson) : {})
    .then(t => console.log(t))
    .catch(e => { console.error(String(e.message)); process.exit(1); });
}
