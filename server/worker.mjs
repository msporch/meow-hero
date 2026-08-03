// Invólucro Cloudflare Workers do mesmo servidor — para quando o multijogador
// precisar ficar no ar sem depender do PC ligado.
//
// A lógica é a MESMA de core.mjs. A única diferença é onde o estado mora:
// Workers não guardam memória entre requisições, então a lista de jogadores
// vive num Durable Object.
//
// Implantar:
//   npm i -g wrangler
//   wrangler deploy
// (ver server/wrangler.toml)
import { Presence, handle, CORS } from './core.mjs';

/** Durable Object: uma instância guarda a lista de jogadores. */
export class SalaDePresenca {
  constructor() {
    this.presence = new Presence();
  }

  async fetch(request) {
    const { pathname } = new URL(request.url);
    let body = null;
    if (request.method === 'POST') {
      try { body = await request.json(); }
      catch { return Response.json({ error: 'json invalido' }, { status: 400, headers: CORS }); }
    }
    const r = handle(this.presence, { method: request.method, path: pathname, body });
    return Response.json(r.json, { status: r.status, headers: { ...CORS, 'Cache-Control': 'no-store' } });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    // Uma sala global. Para escalar, dá para particionar por região
    // geográfica usando um identificador derivado das coordenadas.
    const id = env.SALA.idFromName('global');
    return env.SALA.get(id).fetch(request);
  },
};
