// api/_collateral.js — enlaces a material comercial con token, caducidad, revocación y
// registro de apertura.
//
// EJE, NO INSTANCIA. Este módulo no conoce ninguna marca, ningún dominio, ningún tipo de
// documento y ninguna ruta pública. Sabe una sola cosa: cómo resolver un token contra la
// tabla de enlaces y servir el objeto que ese enlace apunta, para la marca que el entorno
// declara. La ruta que lo monta (`api/bim.js`) es artefacto de una marca; este archivo no.
//
//   · la marca sale de `process.env.BRAND_ID`   (mismo bootstrap que `_channel.js`)
//   · el destinatario, el archivo y la caducidad salen de la FILA
//   · el nombre del bucket es un eje del sistema, no de una marca
//
// Una marca nueva monta el mismo módulo en su dominio, con su `BRAND_ID`, y sus filas
// apuntan a su carpeta del bucket. Cero cambios de esquema y cero código tocado.
//
// LÍMITE DECLARADO, para que nadie prometa de más: esto NO impide que quien abre el
// documento lo guarde — cualquier navegador permite guardar la página o ver el código.
// Lo que garantiza es que no haya botón de descarga, que se sirva embebido, que deje de
// servirse al vencer o al revocarse, y que quede registrado quién lo abrió y cuándo.

import { randomBytes } from 'node:crypto';
import { ChannelError, env, brandId } from './_channel.js';
import { escapeHtml } from './_render.js';

const SCHEMA = 'public';
const TABLE = 'collateral_links';
const BUCKET = 'collateral';

// 16 bytes de aleatoriedad — 128 bits. En base62 son exactamente 22 caracteres.
// `crypto.randomUUID()` no sirve aquí: es legible, es largo, y sus guiones invitan a
// recortarlo al pegarlo en un correo.
const TOKEN_BYTES = 16;
const TOKEN_LENGTH = 22;
const TOKEN_RE = /^[0-9A-Za-z]{22}$/;
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

// El agente de usuario se guarda truncado. Sirve para distinguir «lo abrió en el móvil»
// de «lo abrió un rastreador»; no para perfilar a nadie.
const USER_AGENT_MAX = 200;

// La IP NO se persiste. Se usa en memoria para el conteo del límite de tasa y se
// descarta. La Cláusula Sexta del acuerdo invoca finalidad y proporcionalidad: guardar
// la IP de quien lee el material excede lo necesario para saber si fue abierto.
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

const DB_TIMEOUT_MS = 8_000;
const ASSET_TIMEOUT_MS = 15_000;

// Ruta pública de las dependencias interiorizadas (`scripts/vendor-collateral.mjs`).
// Las páginas de aviso las usan por la misma razón que el documento: abrir cualquier
// superficie de esta ruta no debe abrir una conexión a un tercero.
const ASSETS = '/assets/collateral';

// ── Token ───────────────────────────────────────────────────────────────────────────

export function generateToken() {
  let n = BigInt('0x' + randomBytes(TOKEN_BYTES).toString('hex'));
  const base = BigInt(ALPHABET.length);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % base)] + out;
    n /= base;
  }
  return out.padStart(TOKEN_LENGTH, '0').slice(-TOKEN_LENGTH);
}

// Un token malformado se rechaza ANTES de tocar la base de datos. No es cosmética: es
// lo que impide que una enumeración convierta cada intento en una consulta.
export function isWellFormedToken(token) {
  return typeof token === 'string' && TOKEN_RE.test(token);
}

// ── Límite de tasa en memoria ───────────────────────────────────────────────────────
// Por instancia, no global: Vercel puede tener varias vivas y cada una lleva su cuenta.
// Es un tope BEST-EFFORT declarado, suficiente para que una enumeración no consuma cuota,
// y no pretende ser una defensa distribuida — con 128 bits de entropía la enumeración es
// inviable de todos modos.

const hits = new Map();

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const window = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  window.push(now);
  hits.set(ip, window);

  // Poda perezosa: sin ella el Map crece mientras viva la instancia.
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] >= RATE_LIMIT_WINDOW_MS) hits.delete(k);
    }
  }
  return window.length > RATE_LIMIT_MAX;
}

export function clientIp(req) {
  const fwd = String(req.headers?.['x-forwarded-for'] ?? '').split(',')[0].trim();
  return fwd || String(req.headers?.['x-real-ip'] ?? '').trim() || null;
}

// ── Cliente PostgREST y Storage ─────────────────────────────────────────────────────
// Mismo patrón que `_channel.js`: `fetch` plano, sin dependencias. La clave de servicio
// vive sólo aquí, en código de servidor: esta ruta nunca envía JavaScript al cliente, así
// que la clave no puede acabar en el paquete del navegador.

function serviceHeaders() {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function baseUrl() {
  return env('SUPABASE_URL').replace(/\/+$/, '');
}

async function pgrest(path, { method = 'GET', body = null, profile = SCHEMA } = {}) {
  const headers = { ...serviceHeaders(), Accept: 'application/json' };
  if (method === 'GET') headers['Accept-Profile'] = profile;
  else {
    headers['Content-Profile'] = profile;
    headers['Content-Type'] = 'application/json';
    headers.Prefer = 'return=minimal';
  }

  let res;
  try {
    res = await fetch(`${baseUrl()}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(DB_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ChannelError('DB_UNREACHABLE', `no se pudo alcanzar la base de datos: ${e?.message ?? e}`);
  }

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try {
      const parsed = JSON.parse(text);
      detail = parsed?.message ?? detail;
    } catch (_e) { /* el cuerpo no era JSON: se usa el texto crudo */ }
    throw new ChannelError('COLLATERAL_READ', `${SCHEMA}.${TABLE} respondió ${res.status}: ${detail}`);
  }

  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (_e) {
    return [];
  }
}

// ── 1 · Resolución del enlace ───────────────────────────────────────────────────────
//
// El orden de las comprobaciones importa y es deliberado. La marca se verifica ANTES que
// la vigencia: sin eso, el sitio de una marca informaría del estado de un enlace de otra
// con sólo conocer el token, y «404 o 410» ya es información. Un token de otra marca es
// indistinguible de uno inexistente, que es exactamente lo que debe ser.
//
// Distinguir «vencido» de «inexistente» sí es deliberado, y en el otro sentido: filtra
// algo a quien enumere tokens, pero con 128 bits la enumeración es inviable, y el aviso
// de vencimiento es justamente el que produce la solicitud de renovación.

const COLUMNS = [
  'id', 'token', 'brand_id', 'asset_path', 'recipient_name', 'recipient_email',
  'expires_at', 'revoked_at', 'first_opened_at', 'open_count',
].join(',');

export const OUTCOME = {
  OK: 'ok',
  NOT_FOUND: 'not_found',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
};

export async function resolveLink(token) {
  if (!isWellFormedToken(token)) return { outcome: OUTCOME.NOT_FOUND, reason: 'token malformado', row: null };

  const rows = await pgrest(`${TABLE}?select=${COLUMNS}&token=eq.${encodeURIComponent(token)}&limit=1`);
  const row = rows[0];
  if (!row) return { outcome: OUTCOME.NOT_FOUND, reason: 'token inexistente', row: null };

  if (row.brand_id !== brandId()) {
    return { outcome: OUTCOME.NOT_FOUND, reason: `el enlace pertenece a otra marca (${row.brand_id})`, row: null };
  }
  if (row.revoked_at) return { outcome: OUTCOME.REVOKED, reason: 'enlace revocado', row };
  if (!row.expires_at || Date.parse(row.expires_at) <= Date.now()) {
    return { outcome: OUTCOME.EXPIRED, reason: 'enlace vencido', row };
  }
  return { outcome: OUTCOME.OK, reason: null, row };
}

// ── 2 · Registro de apertura ────────────────────────────────────────────────────────
//
// `first_opened_at` sólo se fija si estaba vacío: es la primera lectura, y una segunda
// apertura no puede reescribirla.
//
// NUNCA bloquea la entrega. Si el registro falla, el documento se sirve igual — jamás al
// revés. Se llama en paralelo con la descarga del objeto, así que no añade espera propia.
//
// Degradación declarada: el incremento se calcula sobre el valor leído, no con un
// `UPDATE … SET open_count = open_count + 1` atómico, porque PostgREST no expresa esa
// forma sin una función. Dos aperturas simultáneas del MISMO enlace podrían contar como
// una. Se acepta a cambio de no añadir una `SECURITY DEFINER` a la superficie: el dato
// que importa —si se abrió y cuándo— no se pierde en ningún caso.

export async function recordOpen(row, userAgent) {
  const now = new Date().toISOString();
  const patch = {
    open_count: (Number(row.open_count) || 0) + 1,
    last_opened_at: now,
    last_user_agent: userAgent ? String(userAgent).slice(0, USER_AGENT_MAX) : null,
  };
  if (!row.first_opened_at) patch.first_opened_at = now;

  await pgrest(`${TABLE}?id=eq.${encodeURIComponent(row.id)}`, { method: 'PATCH', body: patch });
}

// ── 3 · Lectura del objeto en el bucket privado ─────────────────────────────────────
// El bucket NO se hace público en ningún caso: la ruta lo lee desde el servidor con la
// clave de servicio y lo sirve. No se emite ninguna URL firmada, porque una URL firmada
// sobrevive a la revocación hasta que expira por su cuenta.

export async function fetchAsset(assetPath) {
  const clean = String(assetPath ?? '').replace(/^\/+/, '');
  if (!clean || clean.includes('..')) {
    throw new ChannelError('BAD_ASSET_PATH', `asset_path inválido en la fila: '${assetPath}'`, 500);
  }
  const encoded = clean.split('/').map(encodeURIComponent).join('/');

  let res;
  try {
    res = await fetch(`${baseUrl()}/storage/v1/object/${BUCKET}/${encoded}`, {
      headers: serviceHeaders(),
      signal: AbortSignal.timeout(ASSET_TIMEOUT_MS),
    });
  } catch (e) {
    throw new ChannelError('STORAGE_UNREACHABLE', `no se pudo alcanzar el almacenamiento: ${e?.message ?? e}`);
  }

  if (!res.ok) {
    throw new ChannelError(
      'ASSET_MISSING',
      `el bucket '${BUCKET}' respondió ${res.status} para '${clean}'. La fila existe y está vigente, pero el objeto que apunta no está: servir una página vacía haría pasar por entregado algo que no se entregó.`,
      res.status === 404 ? 500 : 502,
    );
  }
  return Buffer.from(await res.arrayBuffer());
}

// ── 4 · Cabeceras ───────────────────────────────────────────────────────────────────
//
// `no-store` es CRÍTICO y no es una preferencia. Sin él, el CDN de Vercel puede cachear
// la respuesta y seguir sirviendo el documento después de que el token haya vencido o se
// haya revocado. Sería un fallo SILENCIOSO: la revocación parecería aplicada y no lo
// estaría — el peor de los fallos posibles en esta ruta, porque nadie lo notaría.
//
// Sin `Content-Disposition: attachment`: el documento se muestra, no se descarga.

export function applyPrivateHeaders(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

// ── 5 · Páginas de aviso ────────────────────────────────────────────────────────────
//
// La identidad visual sale del CANAL (`config.theme`, `config.site_name`), no de un
// literal. Los defaults de abajo son neutros a propósito: un gris no es la marca de
// nadie, y hardcodear la paleta de quien pidió esto primero convertiría el eje en
// instancia.
//
// El correo de contacto sale de `config.contact_email`. Si la fila del canal no lo trae,
// la línea de contacto SE OMITE — inventar una dirección, o dejar la de una marca como
// respaldo, sería exactamente el literal que la regla multimarca prohíbe.

const NEUTRAL_THEME = {
  bg: '#101014',
  surface_1: '#1a1a20',
  text: '#eceae6',
  text_2: 'rgba(236,234,230,0.72)',
  text_3: 'rgba(236,234,230,0.42)',
  line: 'rgba(236,234,230,0.12)',
  accent: '#9a9aa8',
  font_display: 'EB Garamond',
  font_serif: 'Cormorant Garamond',
  font_sans: 'DM Sans',
};

function themeOf(config) {
  return { ...NEUTRAL_THEME, ...(config?.theme && typeof config.theme === 'object' ? config.theme : {}) };
}

export function siteNameOfConfig(config) {
  if (config?.site_name) return String(config.site_name);
  try {
    return new URL(config.base_url).hostname.replace(/^www\./, '');
  } catch (_e) {
    return 'Material reservado';
  }
}

export function noticePage({ config, code, title, heading, lede, aside }) {
  const t = themeOf(config);
  const site = siteNameOfConfig(config);
  const lang = String(config?.locale || 'es').split('-')[0];
  const email = typeof config?.contact_email === 'string' && config.contact_email.trim()
    ? config.contact_email.trim()
    : null;

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} · ${escapeHtml(site)}</title>
<link rel="stylesheet" href="${ASSETS}/fonts.css">
<style>
  :root{--bg:${t.bg};--surface:${t.surface_1};--text:${t.text};--text2:${t.text_2};--text3:${t.text_3};--line:${t.line};--accent:${t.accent}}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;
       background:var(--bg);color:var(--text);font-family:'${t.font_sans}',system-ui,-apple-system,sans-serif;
       font-weight:300;line-height:1.6;-webkit-font-smoothing:antialiased}
  .card{max-width:560px;width:100%;background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:44px 40px}
  .eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);margin-bottom:22px}
  h1{margin:0 0 16px;font-family:'${t.font_display}',Georgia,serif;font-weight:400;font-size:30px;line-height:1.25;letter-spacing:-.01em}
  p{margin:0 0 14px;color:var(--text2);font-size:15px}
  .aside{margin-top:26px;padding-top:20px;border-top:1px solid var(--line);font-size:13px;color:var(--text3)}
  a{color:var(--accent)}
  .site{margin-top:30px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--text3)}
  @media(max-width:520px){.card{padding:32px 24px}h1{font-size:25px}}
</style></head>
<body><main class="card">
  <div class="eyebrow">${escapeHtml(code)}</div>
  <h1>${escapeHtml(heading)}</h1>
  <p>${escapeHtml(lede)}</p>
  ${aside ? `<div class="aside">${escapeHtml(aside)}${email ? ` <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : ''}</div>` : ''}
  <div class="site">${escapeHtml(site)}</div>
</main></body></html>`;
}

// Texto de las dos páginas. Vive junto al eje porque describe el ESTADO del enlace, que
// es del sistema; el idioma sigue al `locale` del canal, y hoy sólo hay una redacción.
export function expiredNotice(config) {
  return noticePage({
    config,
    code: 'Enlace vencido',
    title: 'Este enlace ha vencido',
    heading: 'Este enlace ha vencido.',
    lede: 'El acceso a este material tiene una vigencia limitada, y la de este enlace ya terminó. Se puede emitir uno nuevo a nombre de la misma persona.',
    aside: config?.contact_email
      ? 'Para solicitar un enlace vigente, responda al correo con el que lo recibió, o escriba a'
      : 'Para solicitar un enlace vigente, responda al correo con el que lo recibió.',
  });
}

export function unavailableNotice(config) {
  return noticePage({
    config,
    code: 'Acceso no disponible',
    title: 'Acceso no disponible',
    heading: 'Acceso no disponible.',
    lede: 'Esta dirección no corresponde a ningún material activo. Puede que el enlace esté incompleto: conviene copiarlo entero desde el correo original.',
    aside: config?.contact_email
      ? 'Si el problema persiste, escriba a'
      : 'Si el problema persiste, responda al correo con el que recibió el enlace.',
  });
}

// Fallo de infraestructura. Se rompe RUIDOSO —igual que el resto del renderizador—, pero
// muestra sólo el CÓDIGO, no el detalle: en una ruta que sirve material confidencial, el
// texto de un error de base de datos o de almacenamiento le cuenta a un desconocido cosas
// del sistema que no le tocan. El detalle completo va al log del servidor, que es donde
// se diagnostica.
export function errorNotice(config, code) {
  return noticePage({
    config,
    code: String(code ?? 'UNEXPECTED'),
    title: 'El material no se pudo entregar',
    heading: 'El material no se pudo entregar.',
    lede: 'El enlace es válido, pero ahora mismo no se puede servir el documento. No es necesario solicitar uno nuevo: este mismo enlace seguirá funcionando cuando el problema se resuelva.',
    aside: config?.contact_email
      ? 'Si persiste, avise a'
      : 'Si persiste, responda al correo con el que recibió el enlace.',
  });
}

// ── 6 · Orquestación ────────────────────────────────────────────────────────────────

export async function serveCollateral(req, res, { token, config }) {
  const isHead = req.method === 'HEAD';

  if (rateLimited(clientIp(req))) {
    applyPrivateHeaders(res);
    res.setHeader('Retry-After', '60');
    return isHead ? res.status(429).end() : res.status(429).send(unavailableNotice(config));
  }

  const { outcome, reason, row } = await resolveLink(token);

  if (outcome !== OUTCOME.OK) {
    const gone = outcome === OUTCOME.EXPIRED || outcome === OUTCOME.REVOKED;
    console.warn(`[collateral] ${outcome}: ${reason}`);
    applyPrivateHeaders(res);
    const status = gone ? 410 : 404;
    if (isHead) return res.status(status).end();
    return res.status(status).send(gone ? expiredNotice(config) : unavailableNotice(config));
  }

  // Una petición HEAD comprueba cabeceras (`curl -I`), no lee el documento: contarla
  // inflaría `open_count` y ensuciaría justo la señal que esta tabla existe para dar.
  if (isHead) {
    applyPrivateHeaders(res);
    return res.status(200).end();
  }

  // La descarga y el registro salen a la vez. El registro se atrapa aquí mismo: su fallo
  // se anota y se sigue — el documento se entrega igual.
  const [asset] = await Promise.all([
    fetchAsset(row.asset_path),
    recordOpen(row, req.headers?.['user-agent']).catch((e) => {
      console.error(`[collateral] OPEN_NOT_RECORDED: ${row.id} — ${e?.message ?? e}`);
    }),
  ]);

  applyPrivateHeaders(res);
  return res.status(200).send(asset);
}
