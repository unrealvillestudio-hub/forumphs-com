// Verificación previa al PR (§8 del brief). No toca la DB real: simula PostgREST.
import blogIndex from '../api/blog-index.js';
import blogArticle from '../api/blog-article.js';
import sitemap from '../api/sitemap.js';
import robots from '../api/robots.js';

process.env.SUPABASE_URL = 'https://db.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'no-es-un-secreto-valor-simulado';
process.env.BRAND_ID = 'BrandUnderTest';

const PIECES = [
  { id: '8cdaddb1-b158-4bb4-b44e-43b98f2199d1', brand_id: 'BrandUnderTest', platform: 'chan_key', format: 'post',
    domain: 'el-acta-como-instrumento', status: 'published', created_at: '2026-08-20T10:00:00Z',
    assets: { copy: { title: 'El acta es la única prueba', raw: 'Primer párrafo.\n\nSegundo <b>párrafo</b> con HTML crudo.' },
              image: { url: 'https://cdn.example.invalid/a.png' },
              publication: { published_at: '2026-08-22' } } },
  { id: '987c1631-c569-49b8-a03d-aa6b33adad96', brand_id: 'BrandUnderTest', platform: 'chan_key', format: 'post',
    domain: 'el-acta-como-instrumento', status: 'published', created_at: '2026-08-18T10:00:00Z',
    assets: { copy: { title: 'Hermana del mismo genoma', aife_filtered: 'Cuerpo hermana.' } } },
  { id: 'aaaabbbb-cccc-dddd-eeee-ffff00001111', brand_id: 'BrandUnderTest', platform: 'chan_key', format: 'post',
    domain: 'otro-genoma', status: 'published', created_at: '2026-08-10T10:00:00Z',
    assets: { copy: { title: 'Otro genoma', raw: 'Cuerpo otro.' } } },
];

const CHANNEL_ROW = { brand_id: 'BrandUnderTest', platform_key: 'chan_key', provider: 'vercel_html',
  config: { base_url: 'https://site.example.invalid/', template: 'editorial', items_per_page: 2, related_count: 2, site_name: 'Sitio de Prueba' }, active: true };

function json(status, body) { return { ok: status < 400, status, text: async () => JSON.stringify(body) }; }

// scenario: cómo responde la DB simulada
let scenario = 'happy';
globalThis.fetch = async (url) => {
  const u = String(url);
  const isChannel = u.includes('brand_publish_channels');
  if (isChannel) {
    if (scenario === 'no_table') return json(404, { code: 'PGRST205', message: 'Could not find the table \'intel.brand_publish_channels\' in the schema cache' });
    if (scenario === 'no_row') return json(200, []);
    if (scenario === 'ambiguous') return json(200, [CHANNEL_ROW, { ...CHANNEL_ROW, platform_key: 'otro_key' }]);
    if (scenario === 'no_active_col' && u.includes('active=is.true'))
      return json(400, { code: '42703', message: 'column brand_publish_channels.active does not exist' });
    return json(200, [CHANNEL_ROW]);
  }
  // content_pieces
  if (u.includes('slug')) return json(400, { code: '42703', message: 'column content_pieces.slug does not exist' });
  if (scenario === 'no_published_at' && u.includes('published_at'))
    return json(400, { code: '42703', message: 'column content_pieces.published_at does not exist' });
  if (u.includes('published_at') && scenario !== 'no_published_at') {
    // la columna existe pero viene NULL en estas filas
  }
  let rows = PIECES.map(p => ({ ...p, published_at: null }));
  const m = /platform=eq\.([^&]+)/.exec(u);
  if (m) rows = rows.filter(r => r.platform === decodeURIComponent(m[1]));
  const d = /domain=eq\.([^&]+)/.exec(u);
  if (d) rows = rows.filter(r => r.domain === decodeURIComponent(d[1]));
  const lim = Number(/limit=(\d+)/.exec(u)?.[1] ?? 50);
  const off = Number(/offset=(\d+)/.exec(u)?.[1] ?? 0);
  return json(200, rows.slice(off, off + lim));
};

function mockRes() {
  const r = { headers: {}, statusCode: 200, body: null, _json: null };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = String(v); };
  r.status = (c) => { r.statusCode = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.json = (b) => { r._json = b; r.body = JSON.stringify(b); return r; };
  return r;
}
const mockReq = (query = {}) => ({ method: 'GET', query, headers: { host: 'site.example.invalid', 'x-forwarded-proto': 'https' } });

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name} ${extra}`); }
}

console.log('\n── 1 · /blog devuelve HTML con contenido en la primera respuesta ──');
scenario = 'happy';
let res = mockRes(); await blogIndex(mockReq(), res);
check('status 200', res.statusCode === 200, res.statusCode);
check('content-type html', res.headers['content-type']?.includes('text/html'));
check('cache-control del brief', res.headers['cache-control'] === 's-maxage=300, stale-while-revalidate=86400', res.headers['cache-control']);
check('trae <h2> de artículo sin JS', (res.body.match(/<h2>/g) || []).length >= 2);
check('trae titular real en el HTML', res.body.includes('El acta es la única prueba'));
check('paginación: items_per_page=2 respetado', (res.body.match(/class="card"/g) || []).length === 2, (res.body.match(/class="card"/g)||[]).length);
check('link "Anteriores" cuando hay más', res.body.includes('rel="next"'));
check('canonical desde config.base_url', res.body.includes('<link rel="canonical" href="https://site.example.invalid/blog">'));
check('JSON-LD Blog presente', res.body.includes('"@type":"Blog"'));
check('X-Schema-Fallbacks reportado (falta slug)', Number(res.headers['x-schema-fallbacks']) >= 1, res.headers['x-schema-fallbacks']);

console.log('\n── 2 · /blog/<slug inexistente> devuelve 404 real ──');
res = mockRes(); await blogArticle(mockReq({ slug: 'slug-que-no-existe' }), res);
check('status 404', res.statusCode === 404, res.statusCode);
check('noindex en cabecera', res.headers['x-robots-tag'] === 'noindex');
check('no cachea 404 con la caché larga', res.headers['cache-control'] === 's-maxage=60', res.headers['cache-control']);
check('cuerpo NO vacío', res.body.length > 500);

console.log('\n── 2b · artículo existente (slug derivado) ──');
res = mockRes(); await blogIndex(mockReq(), res);
const slug = /href="\/blog\/([^"]+)"/.exec(res.body)[1];
console.log(`  · slug derivado: ${slug}`);
res = mockRes(); await blogArticle(mockReq({ slug }), res);
check('status 200', res.statusCode === 200, res.statusCode);
check('cuerpo del artículo en HTML', res.body.includes('Primer párrafo.'));
check('HTML de la DB escapado, no inyectado', res.body.includes('&lt;b&gt;párrafo&lt;/b&gt;') && !res.body.includes('Segundo <b>párrafo</b>'));
check('JSON-LD Article', res.body.includes('"@type":"Article"'));
check('canonical del artículo', res.body.includes(`<link rel="canonical" href="https://site.example.invalid/blog/${slug}">`));
check('og:image desde assets.image.url', res.body.includes('og:image" content="https://cdn.example.invalid/a.png"'));
check('datePublished desde assets.publication', res.body.includes('"datePublished":"2026-08-22T00:00:00.000Z"'));
check('bloque de enlace interno (HR-FPHS-08)', res.body.includes('Siga leyendo'));
check('related_count=2 respetado', (res.body.match(/<li><a href="\/blog\//g) || []).length === 2, (res.body.match(/<li><a href="\/blog\//g)||[]).length);
check('hermana del mismo genoma primero', res.body.indexOf('Hermana del mismo genoma') < res.body.indexOf('Otro genoma'));
check('nunca callejón sin salida', res.body.includes('Todos los artículos'));

console.log('\n── 3 · Tabla del canal ausente → degradado, NO 500 ──');
scenario = 'no_table';
res = mockRes(); await blogIndex(mockReq(), res);
check('status 200 (no 500)', res.statusCode === 200, res.statusCode);
check('reporta schema_fallbacks en cabecera', Number(res.headers['x-schema-fallbacks']) >= 1, res.headers['x-schema-fallbacks']);
check('rastro en el HTML', res.body.includes('<!-- schema_fallbacks:'));
check('sirve artículos igual', res.body.includes('El acta es la única prueba'));
check('canonical derivado del host de la petición', res.body.includes('href="https://site.example.invalid/blog"'));
res = mockRes(); await blogIndex(mockReq({ debug: 'schema' }), res);
check('?debug=schema expone el detalle', res._json?.degraded === true && res._json.schema_fallbacks.length >= 1, JSON.stringify(res._json?.schema_fallbacks?.[0]));
res = mockRes(); await blogArticle(mockReq({ slug: 'x' }), res);
check('artículo también degrada sin 500', res.statusCode === 404, res.statusCode);

console.log('\n── 4 · Sin fila activa de canal → fail-loud legible ──');
scenario = 'no_row';
res = mockRes(); await blogIndex(mockReq(), res);
check('status 503 (ruidoso, no 200)', res.statusCode === 503, res.statusCode);
check('código de error en cabecera', res.headers['x-blog-error'] === 'NO_ACTIVE_CHANNEL', res.headers['x-blog-error']);
check('motivo legible en el cuerpo', res.body.includes('no tiene fila activa para brand_id'));
check('no indexable', res.headers['x-robots-tag'] === 'noindex');
check('no cacheable', res.headers['cache-control'] === 'no-store');

console.log('\n── 4b · Dos filas activas → fail-loud (no adivina) ──');
scenario = 'ambiguous';
res = mockRes(); await blogIndex(mockReq(), res);
check('status 503', res.statusCode === 503, res.statusCode);
check('AMBIGUOUS_CHANNEL', res.headers['x-blog-error'] === 'AMBIGUOUS_CHANNEL', res.headers['x-blog-error']);

console.log('\n── 4c · Columna `active` ausente → reintenta sin ella ──');
scenario = 'no_active_col';
res = mockRes(); await blogIndex(mockReq(), res);
check('status 200', res.statusCode === 200, res.statusCode);
check('fallback declarado', Number(res.headers['x-schema-fallbacks']) >= 1);

console.log('\n── 4d · BRAND_ID ausente → fail-loud ──');
scenario = 'happy';
const saved = process.env.BRAND_ID; delete process.env.BRAND_ID;
res = mockRes(); await blogIndex(mockReq(), res);
check('status 503', res.statusCode === 503, res.statusCode);
check('MISSING_ENV', res.headers['x-blog-error'] === 'MISSING_ENV', res.headers['x-blog-error']);
process.env.BRAND_ID = saved;

console.log('\n── 5 · sitemap.xml y robots.txt de la misma consulta ──');
res = mockRes(); await sitemap(mockReq(), res);
check('xml válido', res.body.startsWith('<?xml') && res.body.includes('</urlset>'));
check('incluye los 3 artículos', (res.body.match(/<loc>https:\/\/site\.example\.invalid\/blog\//g) || []).length === 3, (res.body.match(/<loc>https:\/\/site\.example\.invalid\/blog\//g)||[]).length);
check('lastmod desde el sello real', res.body.includes('<lastmod>2026-08-22</lastmod>'));
res = mockRes(); await robots(mockReq(), res);
check('Sitemap desde config.base_url', res.body.includes('Sitemap: https://site.example.invalid/sitemap.xml'));
check('no bloquea el blog', res.body.includes('Allow: /'));

console.log('\n── 6 · Columna published_at ausente → orden cae a created_at ──');
scenario = 'no_published_at';
res = mockRes(); await blogIndex(mockReq({ debug: 'schema' }), res);
check('sin 500', res.statusCode === 200, res.statusCode);
check('fallback de published_at declarado', JSON.stringify(res._json.schema_fallbacks).includes('published_at'), JSON.stringify(res._json.schema_fallbacks));

console.log('\n── 7 · Método no permitido ──');
scenario = 'happy';
res = mockRes(); await blogIndex({ method: 'POST', query: {}, headers: {} }, res);
check('405', res.statusCode === 405, res.statusCode);

console.log(`\n═══ ${pass} pasaron · ${fail} fallaron ═══`);
process.exit(fail ? 1 : 0);
