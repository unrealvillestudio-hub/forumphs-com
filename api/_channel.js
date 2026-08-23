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
const PIECE_OPTIONAL = ['slug', 'published_at'];

export async function fetchPieces(channel, { limit = 50, offset = 0, domain = null } = {}) {
  const brand = brandId();
  const schemaFallbacks = [...(channel.schema_fallbacks ?? [])];

  let optional = [...PIECE_OPTIONAL];
  let rows = null;

  for (let attempt = 0; attempt < 4 && rows === null; attempt++) {
    const cols = [...PIECE_BASE, ...optional];
    const order = optional.includes('published_at')
      ? 'published_at.desc.nullslast,created_at.desc'
      : 'created_at.desc';

    const filters = [eq('brand_id', brand), eq('status', PUBLISHED_STATUS)];
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
          detail: `${CONTENT_SCHEMA}.${CONTENT_TABLE} sin columna ${missing}: se reintenta el select sin ella${missing === 'slug' ? ' y el slug de cada pieza se deriva de domain + prefijo de id' : ' y el orden cae a created_at'} — ${error.message}`,
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
  return {
    pieces: (rows ?? []).map(normalizePiece),
    schema_fallbacks: schemaFallbacks,
    slug_derived: slugDerived,
  };
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

function normalizePiece(row) {
  const assets = (row.assets && typeof row.assets === 'object') ? row.assets : {};
  const copy = (assets.copy && typeof assets.copy === 'object') ? assets.copy : {};
  const image = (assets.image && typeof assets.image === 'object') ? assets.image : {};
  const publication = (assets.publication && typeof assets.publication === 'object') ? assets.publication : {};

  // `published_at` de columna manda; si viene NULL, el sello vive en assets.publication;
  // si tampoco, queda `created_at`. Ninguno de los tres es inventado.
  const stamped = row.published_at || publication.published_at || row.created_at || null;

  const body = String(copy.aife_filtered || copy.raw || '').trim();

  return {
    id: row.id,
    domain: row.domain || null,
    platform: row.platform || null,
    slug: pieceSlug(row),
    title: String(copy.title || '').trim() || 'Sin título',
    body,
    excerpt: excerptOf(body),
    image_url: typeof image.url === 'string' ? image.url : null,
    published_at: stamped,
    published_iso: toIso(stamped),
  };
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
