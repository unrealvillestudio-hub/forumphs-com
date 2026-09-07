#!/usr/bin/env node
// scripts/verify-bim.mjs — verificación de la ruta /bim contra un PostgREST y un Storage
// simulados. Cubre la tabla de pruebas del brief (§7) sin tocar la base de datos real ni
// necesitar despliegue: se sustituye `fetch` y se ejercita el manejador entero.
//
// Es la red de seguridad de una ruta cuyo peor fallo es SILENCIOSO —servir un documento
// revocado desde la caché, o registrar una apertura que nunca ocurrió—: un fallo que nadie
// nota mirando la página.
//
//   node scripts/verify-bim.mjs     → 0 si todo pasa, 1 si algo falla
//
// Los avisos `OPEN_NOT_RECORDED`, `ASSET_MISSING` y `BRANDING_FALLBACK` que salen por
// consola son ESPERADOS: pertenecen a las tres pruebas que inyectan fallos a propósito.

process.env.BRAND_ID = 'ForumPHs';
process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

const DOC = '<!DOCTYPE html><html><body><canvas id="c"></canvas><script src="/assets/collateral/chart.umd.min.js"></script></body></html>';

const VALID = 'aaaaaaaaaaaaaaaaaaaaaa';
const rows = new Map();
const reset = () => {
  rows.clear();
  const base = { brand_id: 'ForumPHs', asset_path: 'ForumPHs/suite.html', open_count: 0, first_opened_at: null, revoked_at: null };
  rows.set(VALID,            { id: '1', token: VALID,                  ...base, expires_at: new Date(Date.now() + 8.64e7).toISOString() });
  rows.set('bbbbbbbbbbbbbbbbbbbbbb', { id: '2', token: 'bbbbbbbbbbbbbbbbbbbbbb', ...base, expires_at: new Date(Date.now() - 8.64e7).toISOString() });
  rows.set('cccccccccccccccccccccc', { id: '3', token: 'cccccccccccccccccccccc', ...base, expires_at: new Date(Date.now() + 8.64e7).toISOString(), revoked_at: new Date().toISOString() });
  rows.set('dddddddddddddddddddddd', { id: '4', token: 'dddddddddddddddddddddd', ...base, brand_id: 'LucienSael', expires_at: new Date(Date.now() + 8.64e7).toISOString() });
};

let dbCalls = [];
const CHANNEL = [{ brand_id: 'ForumPHs', platform_key: 'blog_forumphs', provider: 'vercel_html', active: true,
  config: { site_name: 'ForumPHs', base_url: 'https://forumphs.com', locale: 'es-PA', theme: { bg: '#0E1018', accent: '#C4622D' } } }];

globalThis.fetch = async (url, opts = {}) => {
  const u = String(url); const method = opts.method || 'GET';
  dbCalls.push(`${method} ${u.replace('https://stub.supabase.co', '')}`);
  const ok = (body, status = 200) => new Response(body, { status });

  if (u.includes('brand_publish_channels')) return ok(JSON.stringify(CHANNEL));
  if (u.includes('/storage/v1/object/collateral/')) {
    return u.includes('missing') ? ok('{"error":"not found"}', 404) : ok(DOC);
  }
  if (u.includes('collateral_links')) {
    if (method === 'PATCH') {
      const id = decodeURIComponent(u.split('id=eq.')[1]);
      const row = [...rows.values()].find((r) => r.id === id);
      if (row) Object.assign(row, JSON.parse(opts.body));
      return new Response(null, { status: 204 });
    }
    const token = decodeURIComponent((u.split('token=eq.')[1] || '').split('&')[0]);
    const row = rows.get(token);
    return ok(JSON.stringify(row ? [row] : []));
  }
  return ok('[]', 404);
};

const { default: handler } = await import('../api/bim.js');

function mkRes() {
  const r = { headers: {}, code: null, body: null, ended: false };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.send = (b) => { r.body = Buffer.isBuffer(b) ? b.toString() : String(b); r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  r.json = (o) => r.send(JSON.stringify(o));
  return r;
}

const call = async (token, { method = 'GET', ip = '203.0.113.9', ua = 'TestAgent/1.0' } = {}) => {
  const res = mkRes();
  await handler({ method, query: token === undefined ? {} : { token }, headers: { 'x-forwarded-for': ip, 'user-agent': ua } }, res);
  return res;
};

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FALLA ${name} ${extra}`); }
};

console.log('\n§7 · Verificación posterior al despliegue (contra stubs)\n');
reset();

// 1 — token válido
let r = await call(VALID);
check('token válido → 200 y sirve el documento', r.code === 200 && r.body.includes('<canvas'));
check('open_count pasa a 1 y first_opened_at se llena',
  rows.get(VALID).open_count === 1 && !!rows.get(VALID).first_opened_at);
check('last_user_agent registrado', rows.get(VALID).last_user_agent === 'TestAgent/1.0');

// cabeceras §3
const h = r.headers;
check('Content-Type: text/html; charset=utf-8', h['content-type'] === 'text/html; charset=utf-8');
check('Cache-Control con no-store', h['cache-control'] === 'private, no-store, max-age=0, must-revalidate');
check('X-Robots-Tag noindex/nofollow/noarchive/nosnippet', h['x-robots-tag'] === 'noindex, nofollow, noarchive, nosnippet');
check('Referrer-Policy: no-referrer', h['referrer-policy'] === 'no-referrer');
check('SIN Content-Disposition attachment', !h['content-disposition']);

// 2 — segunda apertura
const firstAt = rows.get(VALID).first_opened_at;
await call(VALID);
check('segunda apertura → open_count 2', rows.get(VALID).open_count === 2);
check('first_opened_at NO cambia', rows.get(VALID).first_opened_at === firstAt);

// 3-4 — vencido y revocado
r = await call('bbbbbbbbbbbbbbbbbbbbbb');
check('token vencido → 410 y página de vencimiento', r.code === 410 && r.body.includes('vencido'));
r = await call('cccccccccccccccccccccc');
check('token revocado → 410', r.code === 410 && r.body.includes('vencido'));

// 5-6 — inexistente y sin token
r = await call('zzzzzzzzzzzzzzzzzzzzzz');
check('token inventado → 404', r.code === 404 && r.body.includes('no disponible'));
r = await call(undefined);
check('/bim sin token → 404', r.code === 404 && r.body.includes('no disponible'));

// 7 — otra marca
dbCalls = [];
r = await call('dddddddddddddddddddddd');
check('token de OTRA marca → 404, nunca sirve el documento', r.code === 404 && !r.body.includes('<canvas'));
check('respuesta de otra marca indistinguible de inexistente', r.body.includes('no disponible'));

// 8 — malformado no consulta la base de datos
dbCalls = [];
r = await call('no-es-un-token');
check('token malformado → 404 SIN consultar la tabla',
  r.code === 404 && !dbCalls.some((c) => c.includes('collateral_links')), JSON.stringify(dbCalls));

// 9 — HEAD (curl -I)
r = await call(VALID, { method: 'HEAD' });
check('HEAD → 200 con las cabeceras de §3', r.code === 200 && r.headers['cache-control'].includes('no-store'));
check('HEAD no incrementa open_count', rows.get(VALID).open_count === 2);
check('HEAD no manda cuerpo', r.body === null && r.ended);

// 10 — el registro nunca bloquea la entrega
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => ((o.method === 'PATCH') ? new Response('{"message":"boom"}', { status: 500 }) : realFetch(u, o));
r = await call(VALID);
check('si el registro falla, el documento se sirve igual', r.code === 200 && r.body.includes('<canvas'));
globalThis.fetch = realFetch;

// 11 — objeto ausente en el bucket → error ruidoso, no 404 silencioso
rows.get(VALID).asset_path = 'ForumPHs/missing.html';
r = await call(VALID);
check('objeto ausente → 5xx ruidoso, no un 404 engañoso', r.code >= 500 && !!r.headers['x-collateral-error']);
check('la página de error no filtra el detalle, sólo el código',
  r.body.includes('ASSET_MISSING') && !r.body.includes('bucket'));
rows.get(VALID).asset_path = 'ForumPHs/suite.html';

// 12 — límite de tasa
reset();
let limited = 0;
for (let i = 0; i < 40; i++) { const x = await call(VALID, { ip: '198.51.100.7' }); if (x.code === 429) limited++; }
check('más de 30 peticiones por IP por minuto → 429', limited > 0 && limited === 40 - 30, `limitadas: ${limited}`);
r = await call(VALID, { ip: '203.0.113.55' });
check('otra IP no queda afectada por el límite ajeno', r.code === 200);

// 13 — canal irresoluble: se degrada el tema, no el acceso
globalThis.fetch = async (u, o = {}) => (String(u).includes('brand_publish_channels')
  ? new Response('{"message":"down"}', { status: 500 }) : realFetch(u, o));
reset();
r = await call(VALID, { ip: '192.0.2.30' });
check('sin fila de canal, el documento vigente SE SIGUE sirviendo', r.code === 200 && r.body.includes('<canvas'));
globalThis.fetch = realFetch;

// 14 — sin contact_email no se inventa una dirección
r = await call('zzzzzzzzzzzzzzzzzzzzzz', { ip: '192.0.2.31' });
check('sin config.contact_email, la página no trae mailto:', !r.body.includes('mailto:'));

console.log(`\n${pass} correctas, ${fail} fallidas\n`);
process.exit(fail ? 1 : 0);
