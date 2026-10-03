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
    assets: { copy: { title: 'Otro genoma', raw: 'Cuerpo otro.' }, image: { url: 'https://cdn.example.invalid/c.png' } } },
  { id: 'ddddeeee-ffff-0000-1111-222233334444', brand_id: 'BrandUnderTest', platform: 'chan_key', format: 'post',
    domain: 'sin-catalogo', status: 'published', created_at: '2026-08-05T10:00:00Z',
    assets: { copy: { title: 'Dominio fuera del catálogo', raw: 'Cuerpo sin tema.' } } },
  // DESCARTADA: `status` sigue en 'published' —el descarte es un sello, no un cambio de
  // estado— y por eso el filtro tiene que mirar `discarded_at` y no `status`.
  { id: '11112222-3333-4444-5555-666677778888', brand_id: 'BrandUnderTest', platform: 'chan_key', format: 'post',
    domain: 'pieza-retirada', status: 'published', created_at: '2026-08-19T10:00:00Z',
    discarded_at: '2026-08-23T20:39:33Z',
    assets: { copy: { title: 'Pieza retirada por calidad', raw: 'Cuerpo de la pieza retirada.' } } },
];

// Pieza EDITADA después de publicarse: su `dateModified` no puede ser una copia de
// `datePublished`.
PIECES[1].edited_at = '2026-08-25T09:30:00Z';

// Par de traducción. Vive APARTE y solo entra en escena cuando `withTranslations` lo
// pide: el caso por defecto —ninguna pieza con `translation_key`— es el que hay hoy en la
// base, y la prueba que importa es que en ese caso NO se emita ni un `hreflang`.
const TRANSLATED = [
  { id: '99990000-1111-2222-3333-444455556666', brand_id: 'BrandUnderTest', platform: 'chan_key', format: 'post',
    domain: 'par-de-idiomas', status: 'published', created_at: '2026-08-24T10:00:00Z',
    assets: { copy: { title: 'Versión en español', raw: 'Cuerpo en español.' }, language: 'es', translation: { key: 'par-uno' } } },
  { id: '77778888-9999-aaaa-bbbb-ccccddddeeee', brand_id: 'BrandUnderTest', platform: 'chan_key', format: 'post',
    domain: 'par-de-idiomas', status: 'published', created_at: '2026-08-24T11:00:00Z',
    assets: { copy: { title: 'English version', raw: 'Body in English.' }, language: 'en-US', translation: { key: 'par-uno' } } },
];
let withTranslations = false;

// Piezas con imágenes dentro del cuerpo (F2). Mismo patrón que el par de traducción: viven
// APARTE y sólo entran cuando `withInlineImages` lo pide, para no mover los recuentos de las
// demás secciones. Van primero y son las más recientes: la primera página del listado las
// muestra, que es donde se comprueba el extracto.
const INLINE_IMAGE_PIECES = [
  { id: 'f2f2a001-0000-4000-8000-000000000001', brand_id: 'BrandUnderTest', platform: 'chan_key', format: 'post',
    domain: 'imagenes-en-el-cuerpo', status: 'published', created_at: '2026-09-30T10:00:00Z',
    assets: { copy: { title: 'Pieza con imágenes en el cuerpo',
      aife_filtered: 'Apertura breve.\n\n![img-1]\n\nSegundo párrafo con **negrita**.\n\n![img-2]\n\nTercer párrafo.\n\n![img-3]\n\nCuarto párrafo.' },
      inline_images: [
        { n: 1, after: 1, focus: 'Apertura breve.', alt: 'Una mesa "larga" & <vacía>', url: 'https://cdn.example.invalid/inline-1.png', path: 'p/inline-1.png', status: 'ok', attempts: 1 },
        { n: 2, after: 2, focus: 'Tercer párrafo.', alt: 'Todavía planificada', url: null, path: null, status: 'planned' },
        { n: 3, after: 3, focus: 'Cuarto párrafo.', alt: 'Servida sin https', url: 'http://cdn.example.invalid/inline-3.png', path: null, status: 'ok' },
      ] } },
  { id: 'f2f2a002-0000-4000-8000-000000000002', brand_id: 'BrandUnderTest', platform: 'chan_key', format: 'post',
    domain: 'imagenes-que-no-llegaron', status: 'published', created_at: '2026-09-29T10:00:00Z',
    assets: { copy: { title: 'Pieza con imágenes que no llegaron',
      aife_filtered: 'Apertura de la segunda.\n\n![img-1]\n\nPárrafo medio.\n\n![img-2]\n\nCierre de la segunda.' },
      // n=1 falló aunque trae url https: manda el estado, no la url. n=2 no tiene entrada.
      inline_images: [
        { n: 1, after: 1, focus: 'Apertura de la segunda.', alt: 'Fallida', url: 'https://cdn.example.invalid/fallida.png', path: null, status: 'failed', error: 'simulado' },
      ] } },
];
let withInlineImages = false;

// ── La marca N+1 ────────────────────────────────────────────────────────────────────
// Otra marca, de otro rubro, otro país, otro idioma, otro `platform_key` y otro dominio.
// Existe solo como DATO: no hay una línea de código que la nombre fuera de este fixture.
// Que el mismo build la sirva es la prueba de que el renderizador es eje y no instancia.
const OTHER_BRAND = 'OtraMarcaOtroRubro';
const OTHER_BRAND_CHANNELS = {
  [OTHER_BRAND]: { brand_id: OTHER_BRAND, platform_key: 'otro_chan', provider: 'vercel_html', active: true,
    config: { base_url: 'https://otra-marca.example.invalid', locale: 'en-CA', items_per_page: 10,
              related_count: 1, site_name: 'Another Brand', blog_label: 'Journal' } },
};
const OTHER_BRAND_PIECES = {
  [OTHER_BRAND]: [
    { id: 'abcd0001-0000-0000-0000-000000000001', brand_id: OTHER_BRAND, platform: 'otro_chan', format: 'post',
      domain: 'another-genome', status: 'published', created_at: '2026-08-21T10:00:00Z',
      assets: { copy: { title: 'A piece that belongs to nobody else', raw: 'Body of the other brand.' }, language: 'en-CA' } },
  ],
};

const CHANNEL_ROW = { brand_id: 'BrandUnderTest', platform_key: 'chan_key', provider: 'vercel_html',
  config: { base_url: 'https://site.example.invalid/', template: 'editorial', items_per_page: 2, related_count: 2, site_name: 'Sitio de Prueba' }, active: true };

// Catálogo de temas de la marca bajo prueba. Valores inventados a propósito: son
// INSTANCIA y el renderizador no debe conocer ninguno. La primera pieza NO tiene imagen
// y la segunda SÍ, que es exactamente el par que el listado debe saber renderizar.
const TOPIC_ROWS = [
  { domain: 'el-acta-como-instrumento', theme_key: 'tema-uno', public_label: 'Rótulo público uno' },
  { domain: 'otro-genoma', theme_key: 'tema-dos', public_label: 'Rótulo público dos' },
  // `sin-catalogo` no está: una pieza sin entrada debe renderizar sin etiqueta.
];

function json(status, body) { return { ok: status < 400, status, text: async () => JSON.stringify(body) }; }

// scenario: cómo responde la DB simulada
let scenario = 'happy';
// topicScenario: cómo responde `intel.brand_topics`, con su propio eje de fallo — la
// etiqueta es enriquecimiento y su caída no puede arrastrar al listado.
let topicScenario = 'happy';
globalThis.fetch = async (url) => {
  const u = String(url);
  const askedBrand = decodeURIComponent(/brand_id=eq\.([^&]+)/.exec(u)?.[1] ?? '');
  const isChannel = u.includes('brand_publish_channels');
  if (isChannel) {
    if (scenario === 'no_table') return json(404, { code: 'PGRST205', message: 'Could not find the table \'intel.brand_publish_channels\' in the schema cache' });
    if (scenario === 'no_row') return json(200, []);
    if (scenario === 'ambiguous') return json(200, [CHANNEL_ROW, { ...CHANNEL_ROW, platform_key: 'otro_key' }]);
    if (scenario === 'no_active_col' && u.includes('active=is.true'))
      return json(400, { code: '42703', message: 'column brand_publish_channels.active does not exist' });
    // La tabla responde por MARCA. Es la única forma de que la prueba multimarca pruebe
    // algo: si el simulador devolviera siempre la misma fila, dos BRAND_ID distintos
    // servirían el mismo catálogo por culpa del simulador y no del código.
    const row = OTHER_BRAND_CHANNELS[askedBrand];
    return json(200, [row ?? CHANNEL_ROW]);
  }
  if (u.includes('brand_topics')) {
    if (topicScenario === 'no_table') return json(404, { code: 'PGRST205', message: 'Could not find the table \'intel.brand_topics\' in the schema cache' });
    if (topicScenario === 'unreachable') throw new TypeError('fetch failed');
    if (topicScenario === 'no_label_col' && u.includes('public_label'))
      return json(400, { code: '42703', message: 'column brand_topics.public_label does not exist' });
    const sel = (/select=([^&]+)/.exec(u)?.[1] ?? '').split(',');
    return json(200, TOPIC_ROWS.map((r) => Object.fromEntries(sel.filter((c) => c in r).map((c) => [c, r[c]]))));
  }

  // content_pieces
  if (u.includes('slug')) return json(400, { code: '42703', message: 'column content_pieces.slug does not exist' });
  if (scenario === 'no_published_at' && u.includes('published_at'))
    return json(400, { code: '42703', message: 'column content_pieces.published_at does not exist' });
  if (scenario === 'no_discarded_at' && u.includes('discarded_at'))
    return json(400, { code: '42703', message: 'column content_pieces.discarded_at does not exist' });
  if (u.includes('published_at') && scenario !== 'no_published_at') {
    // la columna existe pero viene NULL en estas filas
  }
  if (OTHER_BRAND_PIECES[askedBrand]) {
    const own = OTHER_BRAND_PIECES[askedBrand]
      .map(p => ({ published_at: null, edited_at: null, updated_at: null, discarded_at: null, ...p }));
    const pk = /platform=eq\.([^&]+)/.exec(u);
    return json(200, pk ? own.filter(r => r.platform === decodeURIComponent(pk[1])) : own);
  }
  let rows = [...(withInlineImages ? INLINE_IMAGE_PIECES : []), ...(withTranslations ? [...PIECES, ...TRANSLATED] : PIECES)]
    .map(p => ({ published_at: null, edited_at: null, updated_at: null, discarded_at: null, ...p }));
  // El descarte se filtra en PostgREST, no en el renderizador: el simulador tiene que
  // honrarlo o la prueba no probaría nada.
  if (u.includes('discarded_at=is.null')) rows = rows.filter(r => !r.discarded_at);
  else if (u.includes('discarded_at=not.is.null')) rows = rows.filter(r => Boolean(r.discarded_at));
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
check('JSON-LD BlogPosting (subclase de Article, más preciso para un blog)', res.body.includes('"@type":"BlogPosting"'));
check('canonical del artículo', res.body.includes(`<link rel="canonical" href="https://site.example.invalid/blog/${slug}">`));
check('og:image desde assets.image.url', res.body.includes('og:image" content="https://cdn.example.invalid/a.png"'));
check('datePublished desde assets.publication', res.body.includes('"datePublished":"2026-08-22T00:00:00.000Z"'));
check('bloque de enlace interno (HR-FPHS-08)', res.body.includes('Siga leyendo'));
check('related_count=2 respetado', (res.body.match(/<li><a class="rel" href="\/blog\//g) || []).length === 2, (res.body.match(/<li><a class="rel" href="\/blog\//g)||[]).length);
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
check('incluye los 4 artículos', (res.body.match(/<loc>https:\/\/site\.example\.invalid\/blog\//g) || []).length === 4, (res.body.match(/<loc>https:\/\/site\.example\.invalid\/blog\//g)||[]).length);
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

console.log('\n── 8 · Nav: el rótulo destacado en el acento de marca ──');
scenario = 'happy'; topicScenario = 'happy';
res = mockRes(); await blogIndex(mockReq(), res);
check('nav del blog dice "Sin tecnicismos"', res.body.includes('>Sin tecnicismos</a>'));
check('ya no dice "Artículos" en el nav', !/nav>[\s\S]*?>Artículos<[\s\S]*?<\/nav>/.test(res.body));
check('el destacado va en var(--terra)', res.body.includes('.topbar nav a.feature,.topbar nav a.feature:hover,.topbar nav a.feature[aria-current]{color:var(--terra)'));
check('el enlace lleva la clase del destacado', /<a class="feature" href="\/blog"/.test(res.body));
check('la URL /blog NO se movió', res.body.includes('href="/blog"'));

console.log('\n── 9 · Encabezado de /blog ──');
check('H1 nuevo', res.body.includes('<h1>Hablemos sin tecnicismos</h1>'));
check('bajada nueva', res.body.includes('En su edificio se toman decisiones con documentos, cifras y plazos'));
check('la bajada genérica ya no existe', !res.body.includes('Artículos publicados por'));

console.log('\n── 10 · Tarjetas: etiqueta de tema, y la imagen es OPCIONAL ──');
check('etiqueta de tema presente', res.body.includes('<span class="topic">Rótulo público uno</span>'));
check('la etiqueta va en var(--terra)', res.body.includes('.card .topic{') && res.body.includes('color:var(--terra);margin-bottom:13px}'));
check('NO se publica el domain como etiqueta', !res.body.includes('>el-acta-como-instrumento<'));
check('2 tarjetas, 1 con imagen y 1 sin', (res.body.match(/class="card"/g) || []).length === 2 && (res.body.match(/class="shot"/g) || []).length === 1,
  `${(res.body.match(/class="card"/g)||[]).length} tarjetas / ${(res.body.match(/class="shot"/g)||[]).length} imágenes`);
check('la tarjeta sin imagen no deja contenedor vacío', !/<span class="shot"><\/span>/.test(res.body) && !/<span class="shot"><img src=""/.test(res.body));
check('sin marcador de posición gris', !/placeholder|no-image|sin-imagen/i.test(res.body));
const abre = res.body.indexOf('<a class="card"');
const tarjeta1 = res.body.slice(abre, res.body.indexOf('</a>', abre));
check('orden: tema → título → extracto → fecha → imagen',
  tarjeta1.indexOf('class="topic"') < tarjeta1.indexOf('<h2>')
  && tarjeta1.indexOf('<h2>') < tarjeta1.indexOf('<p>')
  && tarjeta1.indexOf('<p>') < tarjeta1.indexOf('class="stamp"')
  && tarjeta1.indexOf('class="stamp"') < tarjeta1.indexOf('class="shot"'), tarjeta1);
check('cada tarjeta mide su contenido (sin hueco por la vecina con imagen)',
  res.body.includes('align-items:start') && !res.body.includes('.card .stamp{margin-top:auto'));

console.log('\n── 10b · Pieza cuyo domain no está en el catálogo → sin etiqueta, sin inventar ──');
res = mockRes(); await blogIndex(mockReq({ page: 2 }), res);
check('la pieza sin tema se lista igual', res.body.includes('Dominio fuera del catálogo'));
check('no imprime la cadena "null"', !/>null</.test(res.body) && !/class="topic">\s*<\/span>/.test(res.body));
check('la que sí tiene tema la muestra', res.body.includes('Rótulo público dos'));

console.log('\n── 11 · brand_topics inalcanzable → tarjeta sin etiqueta, NUNCA 500 ──');
for (const [nombre, modo] of [['tabla ausente', 'no_table'], ['red caída', 'unreachable'], ['columna ausente', 'no_label_col']]) {
  topicScenario = modo;
  res = mockRes(); await blogIndex(mockReq(), res);
  check(`${nombre}: status 200 (no 500)`, res.statusCode === 200, res.statusCode);
  check(`${nombre}: sirve los artículos igual`, res.body.includes('El acta es la única prueba'));
  check(`${nombre}: sin etiqueta de tema`, !res.body.includes('class="topic"'));
  check(`${nombre}: sin etiqueta inventada ni "null"`, !/>null</.test(res.body));
  res = mockRes(); await blogIndex(mockReq({ debug: 'schema' }), res);
  check(`${nombre}: rastro en schema_fallbacks`, JSON.stringify(res._json.schema_fallbacks).includes('brand_topics'), JSON.stringify(res._json.schema_fallbacks));
}
topicScenario = 'happy';

console.log('\n── 12 · El eje en el código, la instancia en el dato ──');
// Estas comprobaciones no pueden nombrar un tema ni escribir un hex: hacerlo sería la
// violación que buscan. Se formulan sobre la FORMA del código, no sobre valores.
const { readFileSync } = await import('node:fs');
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const RENDER = src('api/_render.js');
const OTRAS = ['api/_channel.js', 'api/blog-index.js', 'api/blog-article.js'].map(src);

// El token de marca se declara UNA vez, en `:root` de la plantilla. Su valor se lee de
// ahí — no se escribe en este archivo — y se exige que ningún otro fuente lo repita.
const terra = /--terra:\s*(#[0-9a-fA-F]{3,8})/.exec(RENDER)?.[1];
check('el acento de marca está declarado como token en :root', Boolean(terra), terra);
check('ningún fuente repite el valor del token como literal',
  Boolean(terra) && OTRAS.every((s) => !s.toLowerCase().includes(terra.toLowerCase())));
check('la superficie referencia el token, no el valor',
  RENDER.includes('.card .topic{') && RENDER.includes('color:var(--terra)')
  && (RENDER.match(new RegExp(terra, 'gi')) || []).length === 1);

// Ningún fuente declara una lista de valores con forma de tema. Si alguien pegara los
// temas sembrados en el código, caerían acá sin que este archivo tenga que nombrarlos.
const LISTA_DE_SLUGS = /\[\s*'[a-z0-9]+(?:-[a-z0-9]+)+'(?:\s*,\s*'[a-z0-9]+(?:-[a-z0-9]+)+'){2,}/;
check('ningún fuente enumera valores con forma de tema',
  ![RENDER, ...OTRAS].some((s) => LISTA_DE_SLUGS.test(s)));

// La etiqueta que se imprime sale del dato, y de un solo sitio.
const INDEX = src('api/blog-index.js');
check('la etiqueta impresa proviene solo de public_label',
  (INDEX.match(/class="topic"/g) || []).length === 1
  && /p\.public_label \? .*escapeHtml\(p\.public_label\)/.test(INDEX));

console.log('\n── 13 · 🔴 EL BUG · una pieza DESCARTADA no se lista, no se sirve y no se envía a Google ──');
// Los tres consumidores leen por `fetchPieces`. Esta sección los prueba a los tres, y no
// supone que corregir uno haya corregido a los otros.
scenario = 'happy'; topicScenario = 'happy';
const RETIRADA = 'Pieza retirada por calidad';
res = mockRes(); await blogIndex(mockReq(), res);
const p1 = res.body;
res = mockRes(); await blogIndex(mockReq({ page: 2 }), res);
const p2 = res.body;
res = mockRes(); await blogIndex(mockReq({ page: 3 }), res);
check('LISTADO: la descartada no aparece en ninguna página', ![p1, p2, res.body].some((b) => b.includes(RETIRADA)));
check('LISTADO: la viva sigue apareciendo', p1.includes('El acta es la única prueba'));

res = mockRes(); await sitemap(mockReq(), res);
const sitemapXml = res.body;
check('SITEMAP: la descartada no se envía a Google', !sitemapXml.includes('pieza-retirada'));
check('SITEMAP: sigue enviando las 4 vivas', (sitemapXml.match(/<loc>https:\/\/site\.example\.invalid\/blog\//g) || []).length === 4,
  (sitemapXml.match(/<loc>https:\/\/site\.example\.invalid\/blog\//g) || []).length);

// El slug derivado de la descartada, calculado igual que lo hace el renderizador.
const slugRetirada = 'pieza-retirada-11112222';
res = mockRes(); await blogArticle(mockReq({ slug: slugRetirada }), res);
check('ARTÍCULO: URL directa de la descartada devuelve 410, no 404 y no 200', res.statusCode === 410, res.statusCode);
check('ARTÍCULO: el 410 va noindex', res.headers['x-robots-tag'] === 'noindex');
check('ARTÍCULO: el 410 no publica el cuerpo retirado', !res.body.includes('Cuerpo de la pieza retirada.'));
check('ARTÍCULO: el 410 no se canoniza a sí mismo', !res.body.includes('rel="canonical"'));
check('ARTÍCULO: el 410 no es callejón sin salida', res.body.includes('Ver todos los artículos'));

res = mockRes(); await blogArticle(mockReq({ slug: 'jamas-existio' }), res);
check('ARTÍCULO: un slug que nunca existió sigue dando 404, no 410', res.statusCode === 404, res.statusCode);

console.log('\n── 13b · Sin columna discarded_at → degradado RUIDOSO, y el 410 no se inventa ──');
scenario = 'no_discarded_at';
res = mockRes(); await blogIndex(mockReq({ debug: 'schema' }), res);
check('sin 500', res.statusCode === 200, res.statusCode);
check('el rastro dice que lo descartado se sigue sirviendo',
  JSON.stringify(res._json.schema_fallbacks).includes('NO SE PUEDE FILTRAR LO DESCARTADO'),
  JSON.stringify(res._json.schema_fallbacks));
res = mockRes(); await blogArticle(mockReq({ slug: 'jamas-existio' }), res);
check('sin la columna, el artículo ausente cae a 404 y no a un 410 inventado', res.statusCode === 404, res.statusCode);
scenario = 'happy';

console.log('\n── 14 · JSON-LD: BlogPosting, dateModified real, imagen y migas ──');
res = mockRes(); await blogIndex(mockReq(), res);
const slugEditada = /href="\/blog\/(el-acta-como-instrumento-987c1631)"/.exec(res.body)?.[1]
  ?? /href="\/blog\/([^"]*987c1631)"/.exec(p1 + p2)?.[1];
res = mockRes(); await blogArticle(mockReq({ slug: slugEditada }), res);
check('slug de la pieza editada resuelto', res.statusCode === 200, `${slugEditada} → ${res.statusCode}`);
const ldBlocks = [...res.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => JSON.parse(m[1].replace(/\\u003c/g, '<')));
const posting = ldBlocks.find((b) => b['@type'] === 'BlogPosting');
const crumbs = ldBlocks.find((b) => b['@type'] === 'BreadcrumbList');
check('el tipo es BlogPosting, no Article', Boolean(posting) && !ldBlocks.some((b) => b['@type'] === 'Article'));
check('cada bloque JSON-LD es JSON válido por separado', ldBlocks.length >= 2, ldBlocks.length);
check('todo bloque declara @context', ldBlocks.every((b) => b['@context'] === 'https://schema.org'));
check('dateModified sale de edited_at', posting?.dateModified === '2026-08-25T09:30:00.000Z', posting?.dateModified);
check('dateModified ES DISTINTO de datePublished', posting?.dateModified !== posting?.datePublished,
  `${posting?.datePublished} / ${posting?.dateModified}`);
check('article:modified_time en el <head>', res.body.includes('property="article:modified_time" content="2026-08-25T09:30:00.000Z"'));
check('BreadcrumbList de tres niveles', crumbs?.itemListElement?.length === 3, crumbs?.itemListElement?.length);
check('las migas van portada → listado → artículo',
  crumbs?.itemListElement?.[0]?.item === 'https://site.example.invalid/'
  && crumbs?.itemListElement?.[1]?.item === 'https://site.example.invalid/blog'
  && crumbs?.itemListElement?.[2]?.item === `https://site.example.invalid/blog/${slugEditada}`,
  JSON.stringify(crumbs?.itemListElement?.map((i) => i.item)));

console.log('\n── 14b · La pieza CON imagen la declara en el schema ──');
res = mockRes(); await blogArticle(mockReq({ slug: 'el-acta-como-instrumento-8cdaddb1' }), res);
const conImagen = [...res.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => JSON.parse(m[1].replace(/\\u003c/g, '<'))).find((b) => b['@type'] === 'BlogPosting');
check('image en el structured data', Array.isArray(conImagen?.image) && conImagen.image[0] === 'https://cdn.example.invalid/a.png', JSON.stringify(conImagen?.image));
check('dateModified nunca queda ausente', Boolean(conImagen?.dateModified), conImagen?.dateModified);

console.log('\n── 15 · El listado: ItemList, Organization y WebSite ──');
res = mockRes(); await blogIndex(mockReq(), res);
const idxLd = [...res.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => JSON.parse(m[1].replace(/\\u003c/g, '<')));
const byType = (t) => idxLd.find((b) => b['@type'] === t);
check('Blog presente', Boolean(byType('Blog')));
check('ItemList presente y con las piezas de la página', byType('ItemList')?.itemListElement?.length === 2,
  byType('ItemList')?.itemListElement?.length);
check('las posiciones del ItemList son absolutas en la página 1', byType('ItemList')?.itemListElement?.[0]?.position === 1);
check('Organization presente', Boolean(byType('Organization')));
check('WebSite presente', Boolean(byType('WebSite')));
check('sin logo en el canal, Organization no inventa uno', !('logo' in (byType('Organization') ?? {})));

res = mockRes(); await blogIndex(mockReq({ page: 2 }), res);
const idx2 = [...res.body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  .map((m) => JSON.parse(m[1].replace(/\\u003c/g, '<'))).find((b) => b['@type'] === 'ItemList');
check('la página 2 no repite las posiciones de la 1', idx2?.itemListElement?.[0]?.position === 3, idx2?.itemListElement?.[0]?.position);

console.log('\n── 16 · Paginación declarada: rel=prev / rel=next en las DOS páginas ──');
res = mockRes(); await blogIndex(mockReq(), res);
check('página 1: sin rel=prev', !res.body.includes('<link rel="prev"'));
check('página 1: con rel=next → página 2', res.body.includes('<link rel="next" href="https://site.example.invalid/blog?page=2">'));
res = mockRes(); await blogIndex(mockReq({ page: 2 }), res);
check('página 2: rel=prev apunta a /blog sin ?page=1', res.body.includes('<link rel="prev" href="https://site.example.invalid/blog">'));
// Con 4 piezas vivas y items_per_page=2 la 2 es la última: declarar un `next` hacia una
// página vacía mandaría al rastreador a una URL sin contenido.
check('página 2, que es la última: sin rel=next', !res.body.includes('<link rel="next"'));
res = mockRes(); await blogIndex(mockReq({ page: 2 }), res);
check('el pager visible también apunta a /blog sin ?page=1', res.body.includes('<a href="/blog" rel="prev">'));

console.log('\n── 17 · hreflang: NADA cuando no hay par, recíproco cuando lo hay ──');
withTranslations = false;
res = mockRes(); await blogArticle(mockReq({ slug: 'el-acta-como-instrumento-8cdaddb1' }), res);
check('sin par de idiomas no se emite ni un alternate', !res.body.includes('rel="alternate"'));
check('tampoco un x-default suelto', !res.body.includes('x-default'));

withTranslations = true;
res = mockRes(); await blogArticle(mockReq({ slug: 'par-de-idiomas-99990000' }), res);
check('la versión ES resuelve', res.statusCode === 200, res.statusCode);
const altEs = [...res.body.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
check('emite es, en-US y x-default', altEs.length === 3, JSON.stringify(altEs));
check('se declara a sí misma', altEs.some(([l, h]) => l === 'es' && h.endsWith('/blog/par-de-idiomas-99990000')));
check('declara a su par', altEs.some(([l, h]) => l === 'en-US' && h.endsWith('/blog/par-de-idiomas-77778888')));
check('x-default cae en la del idioma del canal (es-PA → es)',
  altEs.some(([l, h]) => l === 'x-default' && h.endsWith('/blog/par-de-idiomas-99990000')), JSON.stringify(altEs));

res = mockRes(); await blogArticle(mockReq({ slug: 'par-de-idiomas-77778888' }), res);
const altEn = [...res.body.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]);
check('la versión EN emite exactamente los mismos alternates (recíproco)',
  JSON.stringify(altEn) === JSON.stringify(altEs), `${JSON.stringify(altEn)} vs ${JSON.stringify(altEs)}`);

console.log('\n── 18 · lang del <html>: el de la PIEZA, no el del canal ──');
check('pieza en inglés en canal es-PA → lang="en-US"', res.body.includes('<html lang="en-US">'), /<html lang="[^"]*"/.exec(res.body)?.[0]);
check('og:locale sigue al idioma de la pieza', res.body.includes('property="og:locale" content="en_US"'));
check('inLanguage del JSON-LD no contradice al <html>',
  JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(res.body)[1].replace(/\\u003c/g, '<')).inLanguage === 'en-US');
res = mockRes(); await blogArticle(mockReq({ slug: 'par-de-idiomas-99990000' }), res);
check('pieza en español en canal es-PA → gana el locale completo del canal', res.body.includes('<html lang="es-PA">'), /<html lang="[^"]*"/.exec(res.body)?.[0]);
withTranslations = false;
res = mockRes(); await blogArticle(mockReq({ slug: 'el-acta-como-instrumento-8cdaddb1' }), res);
check('pieza sin idioma declarado → manda el canal, no se inventa nada', res.body.includes('<html lang="es-PA">'));

console.log('\n── 19 · ?debug=schema no es rastreable ──');
res = mockRes(); await blogIndex(mockReq({ debug: 'schema' }), res);
check('X-Robots-Tag noindex en la vista de diagnóstico', /noindex/.test(res.headers['x-robots-tag'] ?? ''), res.headers['x-robots-tag']);
check('sigue sin cachearse', res.headers['cache-control'] === 'no-store');

console.log('\n── 20 · MULTIMARCA · el mismo build, dos BRAND_ID, dos catálogos ──');
// Es el test que decide si la extracción del renderizador a un repo compartido puede
// ocurrir: si el mismo código sirve dos marcas sin tocarse, la marca es entorno y dato,
// no código.
scenario = 'happy'; topicScenario = 'happy'; withTranslations = false;
const brandSaved = process.env.BRAND_ID;

process.env.BRAND_ID = 'BrandUnderTest';
res = mockRes(); await blogIndex(mockReq(), res);
const catalogoA = res.body;
res = mockRes(); await sitemap(mockReq(), res);
const sitemapA = res.body;

process.env.BRAND_ID = OTHER_BRAND;
res = mockRes(); await blogIndex(mockReq(), res);
const catalogoB = res.body;
res = mockRes(); await sitemap(mockReq(), res);
const sitemapB = res.body;
process.env.BRAND_ID = brandSaved;

check('marca A sirve SU catálogo', catalogoA.includes('El acta es la única prueba') && !catalogoA.includes('A piece that belongs to nobody else'));
check('marca B sirve SU catálogo', catalogoB.includes('A piece that belongs to nobody else') && !catalogoB.includes('El acta es la única prueba'));
check('cada marca en SU dominio', catalogoA.includes('https://site.example.invalid/blog') && catalogoB.includes('https://otra-marca.example.invalid/blog'));
check('ninguna filtra el dominio de la otra', !catalogoA.includes('otra-marca.example.invalid') && !catalogoB.includes('site.example.invalid'));
check('cada sitemap lista solo lo suyo',
  sitemapA.includes('site.example.invalid/blog/') && !sitemapA.includes('otra-marca')
  && sitemapB.includes('otra-marca.example.invalid/blog/') && !sitemapB.includes('site.example.invalid'));
check('el idioma sale del canal de cada una', catalogoA.includes('<html lang="es-PA">') && catalogoB.includes('<html lang="en-CA">'));
check('el rótulo del listado sale del canal, no del repo', catalogoB.includes('>Journal</div>') && catalogoA.includes('>Artículos</div>'));
check('el nombre del sitio sale del canal', catalogoB.includes('Another Brand') && !catalogoB.includes('Sitio de Prueba'));

console.log('\n── 21-bis · La negrita del generador se pinta; un asterisco suelto es texto ──');
// El generador marca con `**texto**` la frase que abre o remata una sección. Antes de
// esta sección el renderizador la publicaba con los asteriscos a la vista; el publicador
// de blogs por API ya la traducía. Las dos puntas tienen que publicar lo mismo.
{
  const { paragraphs } = await import('../api/_render.js');
  const { excerptOf } = await import('../api/_channel.js');

  const html = paragraphs('Intro.\n\n**Here is the mechanism.** And the rest.\n\nTwo **bold** and **more** words.');
  check('`**texto**` se publica como <strong>', html.includes('<strong>Here is the mechanism.</strong> And the rest.'), html);
  check('varias negritas en un párrafo, cada una por separado',
    html.includes('Two <strong>bold</strong> and <strong>more</strong> words.'), html);
  check('ningún `**` queda a la vista', !html.includes('**'), html);

  const sueltos = paragraphs('Price 5 * 3 and a note*. Also ** alone and ** spaced **.');
  check('un asterisco suelto es texto, no se toca',
    sueltos.includes('5 * 3') && sueltos.includes('note*.') && !sueltos.includes('<strong>'), sueltos);

  const inerte = paragraphs('**<img src=x onerror=alert(1)>** done');
  check('lo que va dentro de la negrita sigue escapado',
    inerte.includes('<strong>&lt;img src=x onerror=alert(1)&gt;</strong>') && !inerte.includes('<img'), inerte);

  const ex = excerptOf('**Here is the mechanism.** It matters that you understand it.');
  check('el extracto (meta description, listado) no lleva asteriscos',
    ex === 'Here is the mechanism. It matters that you understand it.', ex);
  check('el extracto conserva un asterisco suelto', excerptOf('Rated 4* by readers.') === 'Rated 4* by readers.');
}

console.log('\n── 24 · Formato editorial (F1): ## subtítulo, > cita, entradilla, cierre ──');
{
  const { paragraphs } = await import('../api/_render.js');
  const { excerptOf } = await import('../api/_channel.js');
  const body = [
    'First paragraph with **bold**.',
    '## The **mechanism** <script>x</script>',
    'Section text. A # in a sentence and a > sign stay as text.',
    '> One line quote\n> with **heat** inside',
    '### Second heading',
    'Last body paragraph.',
    '— Lucien Sael · Builder, Thinker, Operator',
  ].join('\n\n');
  const html = paragraphs(body);
  check('el primer párrafo es la entradilla', html.startsWith('<p class="lede">First paragraph with <strong>bold</strong>.</p>'), html.slice(0, 90));
  check('## abre una sección numerada con <h2>', html.includes('<div class="sec"><span class="idx" aria-hidden="true">§ 01</span><h2>'));
  check('### también es subtítulo, y la numeración sigue', html.includes('§ 02</span><h2>Second heading</h2>'));
  check('el subtítulo va escapado y sin **', html.includes('<h2>The mechanism &lt;script&gt;x&lt;/script&gt;</h2>'), html);
  check('> es una cita destacada, con sus líneas y su negrita', html.includes('<blockquote class="pull"><p>One line quote<br>with <strong>heat</strong> inside</p></blockquote>'), html);
  check('# y > dentro de una frase son texto', html.includes('A # in a sentence and a &gt; sign stay as text.'));
  check('el cierre con raya se compone aparte', html.includes('<p class="closer">— Lucien Sael · Builder, Thinker, Operator</p>'));
  check('ninguna marca a la vista', !/(^|>)\s*#{1,3}\s|\*\*|>\s*&gt;/.test(html), html);
  check('el extracto no lleva marcas', excerptOf('## Heading\n\n> Quote line\n\nAnd **text**.') === 'Heading Quote line And text.', excerptOf('## Heading\n\n> Quote line\n\nAnd **text**.'));
  check('un cuerpo sin marcas se ve como antes, con entradilla', paragraphs('One.\n\nTwo.') === '<p class="lede">One.</p>\n<p>Two.</p>', paragraphs('One.\n\nTwo.'));
  check('un cierre con raya que NO es el último párrafo es un párrafo normal', !paragraphs('A.\n\n— not last\n\nB.').includes('closer'));
}

console.log('\n── 25 · «Sigue leyendo» lleva la imagen de cada artículo ──');
{
  scenario = 'happy';
  let r = mockRes(); await blogIndex(mockReq(), r);
  const slug = /href="\/blog\/([^"]+)"/.exec(r.body)[1];
  r = mockRes(); await blogArticle(mockReq({ slug }), r);
  const rel = r.body.slice(r.body.indexOf('<section class="related">'));
  check('tarjeta relacionada con imagen cuando la pieza la tiene', /<a class="rel" href="\/blog\/[^"]+"><span class="thumb"><img src="https:\/\/cdn\.example\.invalid\/c\.png"/.test(rel), rel.slice(0, 400));
  check('sin imagen, la tarjeta no reserva hueco', /<a class="rel" href="\/blog\/[^"]+"><span class="t">/.test(rel), rel.slice(0, 400));
  // Las imágenes del carril llevan el titular en la franja inferior: ningún marco las recorta.
  const marcos = (r.body.match(/\.(?:card \.shot|related a\.rel \.thumb)(?: img)?\{[^}]*\}/g) || []).join(' ');
  check('las miniaturas se ven enteras: sin aspect-ratio ni object-fit:cover', marcos.length > 0 && !/aspect-ratio|object-fit:cover/.test(marcos), marcos);
}

console.log('\n── 26 · Imágenes dentro del artículo (F2): `![img-N]` pinta una figura o nada, nunca texto ──');
// Contrato F2 (Sam, 2026-10-02): la marca viaja en el cuerpo y la imagen en
// `assets.inline_images`. Sólo `ok` + url https pinta; todo lo demás desaparece, y en texto
// plano la marca se quita siempre.
{
  scenario = 'happy'; topicScenario = 'happy'; withTranslations = false; withInlineImages = true;
  const articleOf = (html) => html.slice(html.indexOf('<article>'), html.indexOf('</article>'));

  let r = mockRes(); await blogArticle(mockReq({ slug: 'imagenes-en-el-cuerpo-f2f2a001' }), r);
  check('la pieza con imágenes resuelve', r.statusCode === 200, r.statusCode);
  let art = articleOf(r.body);
  check('(a) marca con imagen ok → <figure> con <img>, src y alt escapados',
    art.includes('<figure class="inline-figure"><img src="https://cdn.example.invalid/inline-1.png" alt="Una mesa &quot;larga&quot; &amp; &lt;vacía&gt;" loading="lazy" decoding="async"></figure>'), art);
  check('(a) la figura queda donde estaba la marca: tras la entradilla, antes del segundo párrafo',
    art.indexOf('<p class="lede">Apertura breve.</p>') >= 0
      && art.indexOf('<p class="lede">Apertura breve.</p>') < art.indexOf('inline-1.png')
      && art.indexOf('inline-1.png') < art.indexOf('Segundo párrafo'));
  check('(b) imagen planned → nada: una sola figura en la pieza', (art.match(/<figure/g) || []).length === 1, (art.match(/<figure/g) || []).length);
  check('(d) url no https → no se pinta', !r.body.includes('http://cdn.example.invalid/inline-3.png') && !r.body.includes('Servida sin https'));
  check('ninguna marca a la vista en toda la página (cuerpo, meta description, JSON-LD)', !r.body.includes('![img-') && !r.body.includes('[img-'));
  check('donde no se pinta, no queda un párrafo vacío', !/<p[^>]*>\s*<\/p>/.test(art) && !/\n\n/.test(art), art);

  r = mockRes(); await blogArticle(mockReq({ slug: 'imagenes-que-no-llegaron-f2f2a002' }), r);
  art = articleOf(r.body);
  check('(b) imagen failed (aunque traiga url https) o marca sin entrada → nada',
    r.statusCode === 200 && !art.includes('<figure') && !r.body.includes('fallida.png') && !r.body.includes('![img-'), art);
  check('(b) los párrafos de alrededor se publican igual', art.includes('Párrafo medio.') && art.includes('Cierre de la segunda.'));

  r = mockRes(); await blogIndex(mockReq(), r);
  check('(c) el extracto del índice no contiene la marca',
    r.body.includes('Apertura breve. Segundo párrafo con negrita. Tercer párrafo. Cuarto párrafo.') && !r.body.includes('![img-'),
    (/<h2>Pieza con imágenes en el cuerpo<\/h2>[\s\S]{0,300}/.exec(r.body) || [''])[0]);

  // La figura ocupa la columna a su propia proporción: nada de aspect-ratio, object-fit ni
  // mínimos fijos — así cabe igual a 300 px de ancho efectivo.
  r = mockRes(); await blogArticle(mockReq({ slug: 'imagenes-en-el-cuerpo-f2f2a001' }), r);
  const fig = (r.body.match(/article \.inline-figure(?: img)?\{[^}]*\}/g) || []).join(' ');
  check('CSS de la figura: ancho de la columna, height:auto, sin recorte ni mínimo fijo',
    /img\{[^}]*width:100%/.test(fig) && /height:auto/.test(fig) && !/aspect-ratio|object-fit|min-width|\b\d{3,}px/.test(fig), fig);

  // Bloque puro.
  const { paragraphs } = await import('../api/_render.js');
  const { blocksOf, stripMarks, inlineImagesOf, INLINE_IMAGES_CONTRACT_MAX } = await import('../api/_inline.js');
  const ok = (n, extra = {}) => ({ n, status: 'ok', url: `https://cdn.example.invalid/u${n}.png`, alt: `alt ${n}`, ...extra });
  check('blocksOf reconoce el bloque de imagen, con espacios a los lados',
    JSON.stringify(blocksOf('A.\n\n  ![img-2]  \n\nB.')) === JSON.stringify([{ t: 'p', text: 'A.' }, { t: 'img', n: 2 }, { t: 'p', text: 'B.' }]),
    JSON.stringify(blocksOf('A.\n\n  ![img-2]  \n\nB.')));
  check('dentro de una frase, o con más texto en el bloque, la marca es texto',
    blocksOf('Ver ![img-1] aquí.\n\n![img-1]\nmás').every((b) => b.t === 'p'));
  const fuera = paragraphs('A.\n\n![img-4]\n\n![img-0]\n\nB.', [ok(1), ok(4), ok(0)]);
  check('n fuera de 1..INLINE_IMAGES_CONTRACT_MAX → ni figura ni texto',
    INLINE_IMAGES_CONTRACT_MAX === 3 && !fuera.includes('img-') && !fuera.includes('<figure'), fuera);
  check('la misma imagen se pinta una sola vez aunque su marca se repita',
    (paragraphs('A.\n\n![img-1]\n\nB.\n\n![img-1]\n\nC.', [ok(1)]).match(/<figure/g) || []).length === 1);
  check('el renderizador filtra por su cuenta: planned o url no https no pintan aunque le lleguen',
    !paragraphs('A.\n\n![img-1]\n\nB.', [ok(1, { status: 'planned' })]).includes('<figure')
      && !paragraphs('A.\n\n![img-1]\n\nB.', [ok(1, { url: 'javascript:alert(1)' })]).includes('<figure')
      && !paragraphs('A.\n\n![img-1]\n\nB.', [ok(1, { url: '//cdn.example.invalid/x.png' })]).includes('<figure'));
  check('sin imágenes (la llamada de antes) la marca desaparece y el resto queda igual',
    paragraphs('A.\n\n![img-1]\n\nB.') === '<p class="lede">A.</p>\n<p>B.</p>', paragraphs('A.\n\n![img-1]\n\nB.'));
  check('inlineImagesOf: sólo ok + https + n del contrato; alt siempre string; gana la primera',
    JSON.stringify(inlineImagesOf([ok(1), ok(1, { url: 'https://otra.example.invalid/x.png' }), ok(2, { status: 'failed' }), ok(3, { alt: 7 }), ok(5), null, 'x']))
      === JSON.stringify([{ n: 1, status: 'ok', url: 'https://cdn.example.invalid/u1.png', alt: 'alt 1' }, { n: 3, status: 'ok', url: 'https://cdn.example.invalid/u3.png', alt: '' }]));
  check('inlineImagesOf con el dato ausente o malformado → []', [undefined, null, {}, 'x', 3].every((v) => inlineImagesOf(v).length === 0));
  // La pieza llega al renderizador YA filtrada y el renderizador filtra otra vez: el filtro
  // tiene que dejar pasar su propia salida, o ninguna imagen se pintaría nunca.
  const unaVez = inlineImagesOf([ok(1), ok(2, { status: 'planned' })]);
  check('inlineImagesOf es idempotente: su salida vuelve a pasar el filtro',
    JSON.stringify(inlineImagesOf(unaVez)) === JSON.stringify(unaVez) && unaVez.length === 1);
  check('stripMarks quita el bloque de la marca entero', stripMarks('A.\n\n![img-1]\n\nB.') === 'A.\n\nB.', JSON.stringify(stripMarks('A.\n\n![img-1]\n\nB.')));

  // MULTIMARCA · la marca N+1, de otro rubro, otro país y otro idioma, sólo como DATO: su
  // imagen sale de su CDN con su alt, y nada de la marca bajo prueba se cuela.
  const otra = { id: 'abcd0002-0000-4000-8000-000000000002', brand_id: OTHER_BRAND, platform: 'otro_chan', format: 'post',
    domain: 'harbour-notes', status: 'published', created_at: '2026-09-28T10:00:00Z',
    assets: { copy: { title: 'Notes from a harbour', raw: 'Dawn at the pier.\n\n![img-2]\n\nNets on the dock.\n\n![img-1]\n\nEnd.' }, language: 'en-CA',
      inline_images: [{ n: 2, status: 'ok', url: 'https://media.otra-marca.example.invalid/f2/2.webp', alt: 'Fishing boats moored at dawn' },
        { n: 1, status: 'failed', url: null }] } };
  OTHER_BRAND_PIECES[OTHER_BRAND].push(otra);
  const brandBefore = process.env.BRAND_ID;
  process.env.BRAND_ID = OTHER_BRAND;
  r = mockRes(); await blogArticle(mockReq({ slug: 'harbour-notes-abcd0002' }), r);
  process.env.BRAND_ID = brandBefore;
  OTHER_BRAND_PIECES[OTHER_BRAND].pop();
  art = articleOf(r.body);
  check('marca N+1: su figura, su alt y su CDN; la imagen fallida no deja rastro',
    r.statusCode === 200
      && art.includes('<figure class="inline-figure"><img src="https://media.otra-marca.example.invalid/f2/2.webp" alt="Fishing boats moored at dawn" loading="lazy" decoding="async"></figure>')
      && (art.match(/<figure/g) || []).length === 1 && !r.body.includes('![img-') && !r.body.includes('cdn.example.invalid'), art);


  // ── 26-bis · Paquete de alt (2026-10-03): ancho y alto reales en la figura ──
  console.log('\n── 26-bis · Paquete de alt: la figura lleva width y height reales cuando el dato los trae ──');
  const conDims = (n, w, h, extra = {}) => ok(n, { width: w, height: h, url: `https://cdn.example.invalid/escena-${n}.webp`, ...extra });
  const pintada = paragraphs('A.\n\n![img-1]\n\nB.', [conDims(1, 1408, 768)]);
  check('con width y height válidos, el <img> los lleva (el navegador reserva el sitio)',
    pintada.includes('<img src="https://cdn.example.invalid/escena-1.webp" alt="alt 1" width="1408" height="768" loading="lazy" decoding="async">'), pintada);
  check('sin medidas, la figura sale EXACTAMENTE como antes (lector tolerante)',
    paragraphs('A.\n\n![img-1]\n\nB.', [ok(1)]).includes('<img src="https://cdn.example.invalid/u1.png" alt="alt 1" loading="lazy" decoding="async">'));
  const raras = [[0, 768], [1408, null], ['1408', '768x'], [1408.5, 768], [-1, 768], [99999, 768], [1408, undefined]];
  check('medida incompleta, no entera, negativa o absurda → ninguna de las dos (nunca una sola)',
    raras.every(([w, h]) => { const html = paragraphs('A.\n\n![img-1]\n\nB.', [ok(1, { width: w, height: h })]); return !/width=|height=/.test(html) && html.includes('<figure'); }));
  check('inlineImagesOf conserva las medidas y sigue siendo idempotente',
    JSON.stringify(inlineImagesOf(inlineImagesOf([conDims(2, 800, 600)]))) === JSON.stringify([{ n: 2, status: 'ok', url: 'https://cdn.example.invalid/escena-2.webp', alt: 'alt 2', width: 800, height: 600 }]));
  check('la imagen WebP se pinta igual que la PNG (el renderizador no mira la extensión)',
    paragraphs('A.\n\n![img-3]\n\nB.', [conDims(3, 10, 20)]).includes('escena-3.webp" alt="alt 3" width="10" height="20"'));

  withInlineImages = false;
}

console.log(`\n═══ ${pass} pasaron · ${fail} fallaron ═══`);
process.exit(fail ? 1 : 0);
