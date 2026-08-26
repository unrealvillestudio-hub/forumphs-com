// api/_channel.js — resolución de canal de publicación y lectura de piezas.
//
// EJE, NO INSTANCIA. Este módulo no conoce ninguna marca, ningún dominio y ningún
// `platform_key`. Sabe una sola cosa: cómo preguntarle a la base de datos por el canal
// que ESTE renderizador sabe servir, para la marca que el entorno declara.
//
//   · la marca sale de `process.env.BRAND_ID`   (único bootstrap irreducible)
//   · el `platform_key` sale de la TABLA         (jamás de un literal en el repo)
//   · el `provider` es una enumeración de PROVEEDORES, no de marcas
//
// Una marca nueva entra sembrando una fila en `intel.brand_publish_channels` y
// desplegando su propio sitio con su `BRAND_ID`. Cero código tocado.

const CHANNEL_SCHEMA = 'intel';
const CHANNEL_TABLE = 'brand_publish_channels';
const CONTENT_SCHEMA = 'content';
const CONTENT_TABLE = 'content_pieces';
const TOPIC_SCHEMA = 'intel';
const TOPIC_TABLE = 'brand_topics';

// Columnas de la superficie pública del tema. Son EJE: nombran la función (una clave de
// agrupación y un rótulo legible), no el caso de ninguna marca. Los VALORES —los temas y
// sus rótulos— son instancia y viven en la tabla, resueltos por `brand_id`. Este archivo
// no enumera ni un solo tema: uno nuevo entra sembrando una fila.
const TOPIC_LABEL_COLS = ['theme_key', 'public_label'];

// Techo de la lectura del catálogo de temas de una marca. Acotado a propósito: es un
// diccionario de rótulos, no una consulta abierta.
const TOPIC_LOOKUP_LIMIT = 500;

// Estado que el canal exige para que una pieza sea servible en la web.
const PUBLISHED_STATUS = 'published';

// Mapa explícito de proveedores. Un proveedor desconocido ROMPE RUIDOSO: nunca degrada
// en silencio hacia un renderizador que no es el suyo.
export const PROVIDERS = {
  vercel_html: {
    key: 'vercel_html',
    description: 'HTML completo servido por función serverless de Vercel con caché de CDN',
  },
};

// Defaults DECLARADOS (no silenciosos): si la fila del canal no trae la clave, se usa
// este valor y queda constancia en `config_defaults` de la resolución.
const CONFIG_DEFAULTS = {
  items_per_page: 10,
  related_count: 3,
};

// ── Tolerancia de esquema ───────────────────────────────────────────────────────────
// Mismo patrón ya probado en `content-scheduler/index.ts`: las columnas y tablas que
// aún no existen no se evitan, se piden; si la DB no las tiene se reintenta sin ellas
// dejando rastro en el log y en `schema_fallbacks` de la respuesta. Correr degradado es
// una decisión declarada, no un silencio.

export function isUndefinedColumn(err) {
  const code = String(err?.code ?? '');
  const msg = String(err?.message ?? '');
  return code === '42703' || code === 'PGRST204'
    || /column .* does not exist/i.test(msg)
    || /Could not find the '.*' column/i.test(msg);
}

export function isMissingRelation(err) {
  const code = String(err?.code ?? '');
  const msg = String(err?.message ?? '');
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST106'
    || /relation .* does not exist/i.test(msg)
    || /Could not find the table/i.test(msg);
}

// PostgREST nombra la columna ausente en el mensaje. Extraerla permite reintentar
// dejando fuera exactamente esa, y no el grupo entero.
function namedMissingColumn(err, candidates) {
  const msg = String(err?.message ?? '') + ' ' + String(err?.details ?? '') + ' ' + String(err?.hint ?? '');
  for (const c of candidates) {
    if (new RegExp(`\\b${c}\\b`).test(msg)) return c;
  }
  return null;
}

// ── Error ruidoso ───────────────────────────────────────────────────────────────────

export class ChannelError extends Error {
  constructor(code, detail, status = 503) {
    super(`${code}: ${detail}`);
    this.name = 'ChannelError';
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

// ── Cliente PostgREST sin dependencias ──────────────────────────────────────────────
// Mismo patrón de `api/contact.js`: `fetch` plano. El repo no tiene `package.json` y
// este PR no introduce uno.

function env(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new ChannelError(
      'MISSING_ENV',
      `la variable de entorno ${name} no está definida en el proyecto de Vercel; sin ella no hay a quién preguntar ni por quién preguntar`,
    );
  }
  return String(v).trim();
}

export function brandId() {
  return env('BRAND_ID');
}

async function pgrest({ schema, path }) {
  const base = env('SUPABASE_URL').replace(/\/+$/, '');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  let res;
  try {
    res = await fetch(`${base}/rest/v1/${path}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Accept-Profile': schema,
        Accept: 'application/json',
      },
    });
  } catch (e) {
    throw new ChannelError('DB_UNREACHABLE', `no se pudo alcanzar la base de datos: ${e?.message ?? e}`);
  }
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_e) {
    body = null;
  }
  if (!res.ok) {
    const err = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {};
    return { data: null, error: { code: err.code ?? String(res.status), message: err.message ?? text.slice(0, 400), details: err.details ?? '', hint: err.hint ?? '' } };
  }
  return { data: Array.isArray(body) ? body : (body == null ? [] : [body]), error: null };
}

const eq = (col, val) => `${col}=eq.${encodeURIComponent(val)}`;

// ── 1 · Resolución del canal ────────────────────────────────────────────────────────
//
// Se pide la fila activa de ESTA marca cuyo `provider` es el que este repo implementa.
// El `platform_key` viene de vuelta EN LA FILA: el código nunca lo escribe.
//
//   · tabla ausente        → DEGRADADO declarado (schema_fallbacks), no 500.
//   · tabla sin fila activa → FAIL-LOUD con el motivo exacto.
//   · más de una fila activa → FAIL-LOUD: adivinar cuál es el canal sería un default silencioso.
//   · provider fuera del mapa → FAIL-LOUD.

export async function resolveChannel({ provider, req }) {
  if (!PROVIDERS[provider]) {
    throw new ChannelError(
      'UNKNOWN_PROVIDER',
      `el proveedor '${provider}' no está en el mapa de proveedores de este renderizador (${Object.keys(PROVIDERS).join(', ')})`,
    );
  }

  const brand = brandId();
  const schemaFallbacks = [];
  const configDefaults = [];

  const OPTIONAL = ['active', 'provider'];
  let cols = ['brand_id', 'platform_key', 'provider', 'config', 'active'];
  let filters = [eq('brand_id', brand), eq('provider', provider), 'active=is.true'];
  let rows = null;

  for (let attempt = 0; attempt < 4 && rows === null; attempt++) {
    const path = `${CHANNEL_TABLE}?select=${cols.join(',')}&${filters.join('&')}`;
    const { data, error } = await pgrest({ schema: CHANNEL_SCHEMA, path });

    if (!error) { rows = data; break; }

    if (isMissingRelation(error)) {
      schemaFallbacks.push({
        code: 'SCHEMA_FALLBACK',
        detail: `${CHANNEL_SCHEMA}.${CHANNEL_TABLE} no existe todavía: el canal no se puede resolver desde la tabla; el listado corre sin filtro de platform_key y la URL canónica se deriva del host de la petición — ${error.message}`,
      });
      const derived = derivedBaseUrl(req);
      return {
        degraded: true,
        provider,
        platformKey: null,
        config: { ...CONFIG_DEFAULTS, base_url: derived },
        schema_fallbacks: schemaFallbacks,
        config_defaults: ['items_per_page', 'related_count', 'base_url'],
      };
    }

    if (isUndefinedColumn(error)) {
      const missing = namedMissingColumn(error, OPTIONAL);
      if (missing) {
        schemaFallbacks.push({
          code: 'SCHEMA_FALLBACK',
          detail: `${CHANNEL_SCHEMA}.${CHANNEL_TABLE} sin columna ${missing}: se reintenta la lectura del canal sin ella — ${error.message}`,
        });
        cols = cols.filter((c) => c !== missing);
        filters = filters.filter((f) => !f.startsWith(`${missing}=`));
        continue;
      }
    }

    throw new ChannelError('CHANNEL_READ', `no se pudo leer ${CHANNEL_SCHEMA}.${CHANNEL_TABLE}: ${error.message}`);
  }

  if (!rows || rows.length === 0) {
    throw new ChannelError(
      'NO_ACTIVE_CHANNEL',
      `${CHANNEL_SCHEMA}.${CHANNEL_TABLE} no tiene fila activa para brand_id='${brand}' con provider='${provider}'. Sin esa fila no hay platform_key, ni base_url, ni plantilla: no se sirve nada con valores inventados.`,
    );
  }

  if (rows.length > 1) {
    throw new ChannelError(
      'AMBIGUOUS_CHANNEL',
      `${CHANNEL_SCHEMA}.${CHANNEL_TABLE} tiene ${rows.length} filas activas para brand_id='${brand}' con provider='${provider}' (platform_key: ${rows.map((r) => r.platform_key).join(', ')}). Elegir una sería un default silencioso.`,
    );
  }

  const row = rows[0];
  const raw = (row.config && typeof row.config === 'object') ? row.config : {};

  if (!row.platform_key) {
    throw new ChannelError(
      'CHANNEL_WITHOUT_PLATFORM_KEY',
      `la fila activa de ${CHANNEL_SCHEMA}.${CHANNEL_TABLE} para brand_id='${brand}' no trae platform_key: el contrato de lectura de content_pieces queda sin eje.`,
    );
  }

  const config = { ...raw };
  for (const [k, v] of Object.entries(CONFIG_DEFAULTS)) {
    if (config[k] === undefined || config[k] === null || config[k] === '') {
      config[k] = v;
      configDefaults.push(k);
    }
  }
  if (!config.base_url) {
    config.base_url = derivedBaseUrl(req);
    configDefaults.push('base_url');
  }
  config.base_url = String(config.base_url).replace(/\/+$/, '');
  config.items_per_page = clampInt(config.items_per_page, CONFIG_DEFAULTS.items_per_page, 1, 100);
  config.related_count = clampInt(config.related_count, CONFIG_DEFAULTS.related_count, 0, 20);

  return {
    degraded: false,
    provider: row.provider ?? provider,
    platformKey: row.platform_key,
    config,
    schema_fallbacks: schemaFallbacks,
    config_defaults: configDefaults,
  };
}

function clampInt(v, dflt, min, max) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}

// El host de la petición NO es un literal de marca: es dato que trae el request. Sirve
// de red de seguridad mientras la tabla no exista, y queda declarado como fallback.
export function derivedBaseUrl(req) {
  const proto = String(req?.headers?.['x-forwarded-proto'] ?? 'https').split(',')[0].trim();
  const host = String(req?.headers?.['x-forwarded-host'] ?? req?.headers?.host ?? '').split(',')[0].trim();
  if (!host) return '';
  return `${proto}://${host}`;
}

// ── 2 · Lectura de piezas ───────────────────────────────────────────────────────────
//
// Columnas que todavía no existen en la DB (`slug`, y `published_at` en algunos
// entornos) se PIDEN. Si la DB no las tiene, se reintenta sin ellas y queda rastro.

const PIECE_BASE = ['id', 'brand_id', 'platform', 'format', 'domain', 'status', 'created_at', 'assets'];
const PIECE_OPTIONAL = ['slug', 'published_at', 'edited_at', 'updated_at', 'discarded_at'];

// `status = 'published'` NO alcanza para que una pieza sea servible. Una pieza descartada
// conserva su `status` y suma `discarded_at`: el descarte es un sello, no un cambio de
// estado. Sin este filtro la pieza se sigue listando, se sigue sirviendo por URL directa
// y —lo más caro— se sigue enviando a Google en el sitemap.
//
// El filtro vive en `fetchPieces` a propósito: los TRES consumidores (listado, artículo y
// sitemap) leen por acá, así que corregirlo en un solo sitio los cubre a los tres y no
// hay forma de que uno quede desincronizado del otro.
//
//   · 'exclude' (default) → solo piezas vivas. Es lo que se sirve y lo que se indexa.
//   · 'only'              → solo piezas descartadas. Lo usa el artículo para distinguir
//                           «nunca existió» (404) de «existió y se retiró» (410).
const DISCARDED_MODES = {
  exclude: 'discarded_at=is.null',
  only: 'discarded_at=not.is.null',
};

// Correr sin una columna opcional cuesta algo distinto en cada caso, y ese costo se
// declara en el rastro en vez de dejarlo al lector del log. El de `discarded_at` es el
// único que degrada hacia algo INDEXABLE, y por eso se dice completo.
const MISSING_COLUMN_COST = {
  slug: ' y el slug de cada pieza se deriva de domain + prefijo de id',
  published_at: ' y el orden cae a created_at',
  edited_at: ' y dateModified se apoya solo en updated_at',
  updated_at: ' y dateModified se apoya solo en edited_at',
  discarded_at: ' y NO SE PUEDE FILTRAR LO DESCARTADO: una pieza retirada por calidad se sigue listando, sirviendo e indexando',
};

export async function fetchPieces(channel, { limit = 50, offset = 0, domain = null, discarded = 'exclude' } = {}) {
  const brand = brandId();
  const schemaFallbacks = [...(channel.schema_fallbacks ?? [])];

  if (!DISCARDED_MODES[discarded]) {
    throw new ChannelError(
      'UNKNOWN_DISCARDED_MODE',
      `modo de descarte '${discarded}' desconocido (${Object.keys(DISCARDED_MODES).join(', ')})`,
      500,
    );
  }

  let optional = [...PIECE_OPTIONAL];
  let rows = null;

  for (let attempt = 0; attempt < 6 && rows === null; attempt++) {
    const cols = [...PIECE_BASE, ...optional];
    const order = optional.includes('published_at')
      ? 'published_at.desc.nullslast,created_at.desc'
      : 'created_at.desc';

    const filters = [eq('brand_id', brand), eq('status', PUBLISHED_STATUS)];
    if (optional.includes('discarded_at')) {
      filters.push(DISCARDED_MODES[discarded]);
    } else if (discarded === 'only') {
      // Sin la columna no hay forma de saber qué se descartó. Devolver «ninguna» es la
      // respuesta honesta: el artículo cae a 404 en vez de inventar un 410.
      return { pieces: [], schema_fallbacks: schemaFallbacks, slug_derived: !optional.includes('slug') };
    }
    if (channel.platformKey) {
      filters.push(eq('platform', channel.platformKey));
    } else if (attempt === 0) {
      schemaFallbacks.push({
        code: 'SCHEMA_FALLBACK',
        detail: 'canal sin platform_key resoluble: el listado corre sin filtro de plataforma y puede incluir piezas de otros canales de la misma marca',
      });
    }
    if (domain) filters.push(eq('domain', domain));

    const path = `${CONTENT_TABLE}?select=${cols.join(',')}&${filters.join('&')}&order=${order}&limit=${limit}&offset=${offset}`;
    const { data, error } = await pgrest({ schema: CONTENT_SCHEMA, path });

    if (!error) { rows = data; break; }

    if (isUndefinedColumn(error)) {
      const missing = namedMissingColumn(error, optional);
      if (missing) {
        schemaFallbacks.push({
          code: 'SCHEMA_FALLBACK',
          detail: `${CONTENT_SCHEMA}.${CONTENT_TABLE} sin columna ${missing}: se reintenta el select sin ella${MISSING_COLUMN_COST[missing] ?? ''} — ${error.message}`,
        });
        optional = optional.filter((c) => c !== missing);
        continue;
      }
      schemaFallbacks.push({
        code: 'SCHEMA_FALLBACK',
        detail: `${CONTENT_SCHEMA}.${CONTENT_TABLE} rechazó columnas opcionales (${optional.join(', ')}); se reintenta sin ninguna — ${error.message}`,
      });
      optional = [];
      continue;
    }

    if (isMissingRelation(error)) {
      schemaFallbacks.push({
        code: 'SCHEMA_FALLBACK',
        detail: `${CONTENT_SCHEMA}.${CONTENT_TABLE} no existe: no hay piezas que listar — ${error.message}`,
      });
      return { pieces: [], schema_fallbacks: schemaFallbacks, slug_derived: true };
    }

    throw new ChannelError('PIECES_READ', `no se pudo leer ${CONTENT_SCHEMA}.${CONTENT_TABLE}: ${error.message}`);
  }

  const slugDerived = !optional.includes('slug');

  // La unión con el catálogo de temas ocurre acá, no en PostgREST: `content_pieces` y
  // `brand_topics` viven en esquemas distintos y un `embed` entre esquemas depende de
  // una FK declarada y de que ambos estén expuestos. Un diccionario por `brand_id` y un
  // match por `domain` da el mismo resultado sin esa dependencia, y degrada solo.
  const topics = (rows ?? []).length
    ? await fetchTopicLabels(brand, schemaFallbacks)
    : new Map();

  return {
    pieces: (rows ?? []).map((r) => normalizePiece(r, topics)),
    schema_fallbacks: schemaFallbacks,
    slug_derived: slugDerived,
  };
}

// ── 3 · Etiquetas públicas de tema ──────────────────────────────────────────────────
//
// `content_pieces.domain` NO es un rótulo publicable, por dos razones medidas:
//
//   · el sufijo de un dominio es el FRENTE DE AUDIENCIA, no el tema: dos dominios
//     hermanos son el mismo tema contado a dos audiencias, y publicarlos como temas
//     distintos duplicaría la entrada y expondría maquinaria interna;
//   · los dominios están redactados como ÁNGULOS DE ESCRITURA — buena instrucción al
//     escritor, mala navegación.
//
// Por eso la superficie pública lee `public_label` y agrupa por `theme_key`, ambos
// resueltos por `brand_id` desde la tabla. Este módulo no conoce ni un solo tema.
//
// ESTA LECTURA NUNCA ROMPE. Es enriquecimiento, no contrato: si la tabla no existe, si
// las columnas no existen o si la red falla, se devuelve un diccionario vacío, la tarjeta
// se renderiza SIN etiqueta y el motivo queda en `schema_fallbacks`. Nunca un 500, nunca
// una etiqueta inventada.
export async function fetchTopicLabels(brand, schemaFallbacks = []) {
  const byDomain = new Map();
  let labelCols = [...TOPIC_LABEL_COLS];

  for (let attempt = 0; attempt < 3; attempt++) {
    // Sin ninguna columna de etiqueta no queda nada que unir: pedir solo `domain` sería
    // una consulta sin uso.
    if (!labelCols.length) return byDomain;

    const cols = ['domain', ...labelCols];
    const path = `${TOPIC_TABLE}?select=${cols.join(',')}&${eq('brand_id', brand)}&limit=${TOPIC_LOOKUP_LIMIT}`;

    let result;
    try {
      result = await pgrest({ schema: TOPIC_SCHEMA, path });
    } catch (e) {
      // `pgrest` lanza si la DB no se alcanza. Para el canal eso es fatal; para una
      // etiqueta no lo es.
      schemaFallbacks.push({
        code: 'SCHEMA_FALLBACK',
        detail: `${TOPIC_SCHEMA}.${TOPIC_TABLE} inalcanzable: las tarjetas se renderizan sin etiqueta de tema — ${e?.detail ?? e?.message ?? e}`,
      });
      return byDomain;
    }

    const { data, error } = result;

    if (!error) {
      for (const row of data ?? []) {
        if (!row?.domain) continue;
        byDomain.set(String(row.domain), {
          theme_key: textOrNull(row.theme_key),
          public_label: textOrNull(row.public_label),
        });
      }
      return byDomain;
    }

    if (isUndefinedColumn(error)) {
      const missing = namedMissingColumn(error, labelCols);
      if (missing) {
        schemaFallbacks.push({
          code: 'SCHEMA_FALLBACK',
          detail: `${TOPIC_SCHEMA}.${TOPIC_TABLE} sin columna ${missing}: se reintenta el diccionario de temas sin ella — ${error.message}`,
        });
        labelCols = labelCols.filter((c) => c !== missing);
        continue;
      }
      schemaFallbacks.push({
        code: 'SCHEMA_FALLBACK',
        detail: `${TOPIC_SCHEMA}.${TOPIC_TABLE} rechazó las columnas de etiqueta (${labelCols.join(', ')}): las tarjetas se renderizan sin etiqueta de tema — ${error.message}`,
      });
      return byDomain;
    }

    // Relación ausente o cualquier otro fallo de lectura: se degrada declarándolo.
    schemaFallbacks.push({
      code: 'SCHEMA_FALLBACK',
      detail: `${TOPIC_SCHEMA}.${TOPIC_TABLE} no se pudo leer: las tarjetas se renderizan sin etiqueta de tema — ${error.message}`,
    });
    return byDomain;
  }

  return byDomain;
}

// Una columna de texto que llega vacía, en blanco o nula NO es una etiqueta. Se devuelve
// `null` para que la tarjeta omita el bloque entero: imprimir la cadena `null` en
// pantalla sería peor que no tener etiqueta.
function textOrNull(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

// Cuando la columna `slug` no existe, el slug se DERIVA de forma estable y única:
// `domain` (que ya es un identificador legible del genoma) + prefijo del uuid, porque
// varias piezas comparten dominio. Al aterrizar el DDL, la columna real manda.
export function pieceSlug(row) {
  if (row.slug) return String(row.slug);
  const base = slugify(row.domain || 'articulo');
  return `${base}-${String(row.id).replace(/-/g, '').slice(0, 8)}`;
}

export function slugify(s) {
  return String(s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'articulo';
}

function normalizePiece(row, topics = null) {
  const assets = (row.assets && typeof row.assets === 'object') ? row.assets : {};
  const copy = (assets.copy && typeof assets.copy === 'object') ? assets.copy : {};
  const image = (assets.image && typeof assets.image === 'object') ? assets.image : {};
  const publication = (assets.publication && typeof assets.publication === 'object') ? assets.publication : {};

  // `published_at` de columna manda; si viene NULL, el sello vive en assets.publication;
  // si tampoco, queda `created_at`. Ninguno de los tres es inventado.
  const stamped = row.published_at || publication.published_at || row.created_at || null;

  // `dateModified` NO puede ser una copia de `datePublished`: declarar que nunca se
  // modificó algo que sí se modificó es una señal falsa, y Google la lee. El sello real
  // es el MÁS RECIENTE entre publicación, edición humana y última escritura de la fila.
  // Cuando ninguno es posterior, `modified` cae sobre `stamped` y la igualdad es cierta.
  const modified = latestStamp([stamped, row.edited_at, row.updated_at]);

  const body = String(copy.aife_filtered || copy.raw || '').trim();

  // Etiqueta de tema: la del dominio de esta pieza, si el catálogo la trajo. Sin entrada
  // en el catálogo, ambas quedan en `null` y la superficie omite el bloque.
  const topic = (topics && row.domain) ? topics.get(String(row.domain)) : null;

  return {
    id: row.id,
    domain: row.domain || null,
    platform: row.platform || null,
    slug: pieceSlug(row),
    title: String(copy.title || '').trim() || 'Sin título',
    body,
    excerpt: excerptOf(body),
    image_url: typeof image.url === 'string' && image.url.trim() ? image.url.trim() : null,
    theme_key: topic?.theme_key ?? null,
    public_label: topic?.public_label ?? null,
    published_at: stamped,
    published_iso: toIso(stamped),
    modified_at: modified,
    modified_iso: toIso(modified),
    // Idioma DE LA PIEZA, que no tiene por qué ser el del canal: una pieza en inglés
    // dentro de un canal `es-PA` se declara inglesa o no se declara. `null` cuando el
    // dato no viene — el `lang` del canal manda, y no se inventa ninguno.
    language: languageOf(assets),
    // Clave de grupo de traducción. Es el ÚNICO eje admisible para `hreflang`: dos
    // piezas del mismo `domain` son hermanas del mismo genoma, no traducciones una de
    // otra, y emparejarlas por dominio produciría alternates falsos.
    translation_key: translationKeyOf(assets),
    discarded_at: row.discarded_at ?? null,
  };
}

// El sello más reciente de una lista de candidatos. Un valor no parseable no gana por
// accidente: se descarta.
function latestStamp(candidates) {
  let bestRaw = null;
  let bestMs = -Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const ms = new Date(c).getTime();
    if (Number.isNaN(ms) || ms <= bestMs) continue;
    bestMs = ms;
    bestRaw = c;
  }
  return bestRaw;
}

// ── Idioma y grupo de traducción de la pieza ────────────────────────────────────────
//
// Ninguno de los dos tiene columna propia todavía: viven en `assets`, donde el productor
// de la pieza ya los estampa. Se leen por RUTAS DECLARADAS, en orden de autoridad, y la
// primera que traiga un valor válido gana. Ninguna ruta nombra una marca ni un idioma
// concreto: son la forma del dato, no su valor.
const LANGUAGE_PATHS = [
  ['language'],
  ['copy', 'language'],
  ['builder_meta', 'language'],
  ['builder_dispatch', 'language'],
  ['builder_input', 'language'],
];

// La pieza y su traducción comparten esta clave. Mientras nadie la estampe, `hreflang`
// no emite NADA: un alternate que apunta a una URL que no existe es peor que ninguno.
const TRANSLATION_KEY_PATHS = [
  ['translation_key'],
  ['translation', 'key'],
  ['i18n', 'key'],
];

function atPath(assets, path) {
  let cur = assets;
  for (const step of path) {
    if (!cur || typeof cur !== 'object') return null;
    cur = cur[step];
  }
  return typeof cur === 'string' ? cur.trim() || null : null;
}

// Etiqueta de idioma BCP-47 bien formada, o `null`. Un valor con otra forma no se
// «arregla»: se descarta, porque un `lang` inválido en el HTML es ruido para el rastreador.
export function normalizeLanguage(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(t)) return null;
  const [primary, ...rest] = t.split('-');
  return [primary.toLowerCase(), ...rest].join('-');
}

export function languageOf(assets) {
  for (const path of LANGUAGE_PATHS) {
    const lang = normalizeLanguage(atPath(assets, path));
    if (lang) return lang;
  }
  return null;
}

export function translationKeyOf(assets) {
  for (const path of TRANSLATION_KEY_PATHS) {
    const key = atPath(assets, path);
    if (key) return key;
  }
  return null;
}

// ── Versiones de una pieza en otros idiomas ─────────────────────────────────────────
//
// Devuelve la lista de alternates de `piece` —ella incluida— o `[]`. El caso vacío es el
// NORMAL mientras nadie estampe `translation_key`, y es el correcto: un `hreflang` que
// apunta a una URL que no existe, o que etiqueta mal un idioma, hace más daño que su
// ausencia. Por eso cada condición de abajo, al no cumplirse, devuelve `[]` en vez de
// emitir algo aproximado.
//
// `defaultLanguage` es el idioma del canal: decide cuál de las versiones lleva el
// `x-default`. Si ninguna coincide, gana la primera por orden alfabético de etiqueta —
// una regla estable, para que las N páginas del grupo declaren el MISMO x-default.
export function translationAlternates(pieces, piece, defaultLanguage = null) {
  const key = piece?.translation_key;
  if (!key) return [];

  const group = (pieces ?? []).filter((p) => p.translation_key === key);
  if (group.length < 2) return [];
  // Sin idioma no hay etiqueta que poner; con dos piezas del mismo idioma no hay forma
  // de saber cuál es «la» versión de ese idioma. Ninguno de los dos se adivina.
  if (group.some((p) => !p.language)) return [];
  if (new Set(group.map((p) => p.language)).size !== group.length) return [];
  if (!group.some((p) => p.id === piece.id)) return [];

  const sorted = [...group].sort((a, b) => a.language.localeCompare(b.language));
  const primary = (l) => String(l).split('-')[0].toLowerCase();
  const fallbackLang = normalizeLanguage(defaultLanguage);
  const xDefault = (fallbackLang && sorted.find((p) => primary(p.language) === primary(fallbackLang))) || sorted[0];

  return [
    ...sorted.map((p) => ({ hreflang: p.language, slug: p.slug })),
    { hreflang: 'x-default', slug: xDefault.slug },
  ];
}

function toIso(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function excerptOf(body, max = 155) {
  const flat = String(body).replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:—-]+$/, '')}…`;
}
