// api/_render.js — plantilla HTML del renderizador `vercel_html`.
//
// Devuelve HTML COMPLETO en la primera respuesta HTTP. No hay shell estático ni `fetch`
// en cliente: el requisito es SEO-first y un contenido cargado por JS no se indexa de
// forma fiable.
//
// Ningún dominio, ningún nombre de marca y ningún `platform_key` viven aquí. El título
// del sitio y la URL canónica se construyen desde `config` del canal; los tokens de
// color se declaran una sola vez y coinciden con los de `index.html`.

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON-LD embebido: se neutraliza `</script` para que el bloque no pueda cerrar la
// etiqueta que lo contiene.
export function jsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

export function absoluteUrl(baseUrl, path) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

// Geometria del wordmark, portada verbatim del vFINAL. Es EJE: no depende de ninguna
// marca. Se exporta porque la sirven dos superficies —la cabecera del blog y las paginas
// de aviso de /bim— y una sola definicion es lo que impide que se separen.
export const WORDMARK_GEOMETRY = `.wm{display:inline-flex;align-items:baseline;gap:0;line-height:1}
.wm-xl>span{font-size:54px}.wm-lg>span{font-size:36px}.wm-md>span{font-size:26px}
.wm-sm>span{font-size:18px}.wm-xs>span{font-size:13px}.wm-xxs>span{font-size:10px}`;

const STYLE = `
:root{
  --void:#0A090C;--carbon:#111018;--graphite:#1C1A26;--surface:#231F30;
  --amethyst:#7C3AED;--ame-dim:rgba(124,58,237,0.15);--terra:#C4622D;
  --chalk:#F9F8FF;--chalk-72:rgba(249,248,255,0.72);--chalk-42:rgba(249,248,255,0.42);
  --chalk-12:rgba(249,248,255,0.12);--chalk-06:rgba(249,248,255,0.06);--gold:#D4A853;
  --font-display:'Cinzel',serif;--font-serif:'EB Garamond',serif;--font-sans:'DM Sans',sans-serif;
  --font-editorial:'Cormorant Garamond',serif;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{background:var(--void);color:var(--chalk);font-family:var(--font-sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:760px;margin:0 auto;padding:0 24px}
.topbar{border-bottom:1px solid var(--chalk-12);background:rgba(10,9,12,.88);position:sticky;top:0;z-index:10;backdrop-filter:blur(10px)}
/* El encabezado se reacomoda solo: flex-wrap deja caer la nav a una segunda fila
   exactamente cuando los tres enlaces dejan de caber junto a la marca, sin punto de
   corte inventado. min-height en vez de height es lo que deja crecer la barra: con la
   altura fija la segunda fila se salía de la caja. Sin esto, por debajo de 399px el
   contenido se comía los 24px de padding del .wrap y por debajo de 375px desbordaba la
   página en horizontal. */
.topbar .wrap{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 16px;min-height:64px;padding-top:10px;padding-bottom:10px;max-width:1080px}
.mark{text-decoration:none;display:inline-flex}
/* ── SISTEMA DE WORDMARK ─────────────────────────────────────────────────────
   Portado de BluePrints/brands/ForumPHs/assets/ForumPHs_Amatista_Carbon_vFINAL.html.
   La GEOMETRIA es eje y vive aqui; los VALORES —texto, familia, peso, color y
   tracking de cada parte— son instancia y salen de config.wordmark del canal.
   Las tres partes comparten el MISMO font-size: es lo que alinea las alturas de
   caja de "Forum" y "PH" y deja la "s" a la altura de x de "orum". No hay
   jerarquia interna, y reducir una parte rompe el sistema. */
${WORDMARK_GEOMETRY}
.mark b{color:var(--terra);font-weight:600}
.topbar nav{display:flex;flex-wrap:wrap;gap:10px 22px;font-family:var(--font-editorial);font-weight:300;font-size:13px;letter-spacing:.08em;text-transform:uppercase}
.topbar nav a{color:var(--chalk-42);text-decoration:none;white-space:nowrap}
.topbar nav a:hover,.topbar nav a[aria-current]{color:var(--chalk)}
/* El enlace activo se distingue por COLOR, no por peso. El sistema asigna a las versales
   con tracking Cormorant Light 300, y el import trae 300/400/500: pedir 600 no carga un
   corte mas grueso, hace que el navegador SINTETICE una negrita falsa — se ve casi bien
   y no es la tipografia de la marca. */
.topbar nav a.feature,.topbar nav a.feature:hover,.topbar nav a.feature[aria-current]{color:var(--terra)}
.topbar nav a.feature:hover{filter:brightness(1.18)}
.hero{padding:72px 0 40px;border-bottom:1px solid var(--chalk-06)}
.eyebrow{font-family:var(--font-editorial);font-weight:300;font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:var(--terra);margin-bottom:18px}
h1{font-family:var(--font-serif);font-size:clamp(30px,5.2vw,46px);font-weight:500;line-height:1.16;letter-spacing:-.01em}
.lede{margin-top:16px;font-size:17px;line-height:1.6;color:var(--chalk-72);max-width:62ch}
.meta{margin-top:22px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--chalk-42);display:flex;gap:14px;flex-wrap:wrap}
.meta span{display:inline-flex;align-items:center;gap:8px}
.cover{margin:40px 0 0;border:1px solid var(--chalk-12);border-radius:4px;overflow:hidden;background:var(--carbon)}
.cover img{display:block;width:100%;height:auto}
article{padding:44px 0 8px}
article p{font-family:var(--font-serif);font-size:19px;line-height:1.72;color:rgba(249,248,255,.86);margin-bottom:22px}
article p:last-child{margin-bottom:0}
.list{list-style:none;padding:46px 0 0;display:grid;gap:18px;align-items:start;grid-template-columns:repeat(auto-fill,minmax(292px,1fr))}
.card{display:flex;flex-direction:column;text-decoration:none;background:var(--carbon);border:1px solid var(--chalk-12);border-radius:3px;padding:24px 24px 22px;transition:border-color .18s,background .18s}
.card:hover{border-color:var(--terra);background:var(--surface)}
.card .topic{font-family:var(--font-editorial);font-size:12px;font-weight:300;letter-spacing:.22em;text-transform:uppercase;color:var(--terra);margin-bottom:13px}
.card h2{font-family:var(--font-serif);font-size:22px;font-weight:500;line-height:1.26;padding-left:14px;border-left:2px solid var(--terra);margin-bottom:11px}
.card p{font-size:14px;line-height:1.62;color:var(--chalk-72);margin-bottom:18px}
.card .stamp{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--chalk-42)}
/* La imagen es OPCIONAL y refuerza, no gobierna: cuando no existe no se emite nada — ni
   marcador de posición, ni caja vacía, ni alto reservado.
   El align-items:start de la grilla es lo que hace que eso baste: cada tarjeta mide lo
   que mide su contenido. Estirarlas a la altura de la fila abriría, dentro de la tarjeta
   SIN imagen, exactamente el hueco que este bloque prohíbe — el alto lo impondría la
   imagen de la vecina. Las columnas siguen alineadas; solo el borde inferior varía. */
.card .shot{margin-top:16px;border-radius:2px;overflow:hidden;aspect-ratio:16/9}
.card .shot img{display:block;width:100%;height:100%;object-fit:cover}
.related{margin-top:56px;padding-top:30px;border-top:1px solid var(--amethyst)}
.related h2{font-family:var(--font-display);font-size:11px;letter-spacing:.28em;text-transform:uppercase;color:var(--terra);margin-bottom:6px}
.related .why{font-size:13px;color:var(--chalk-42);margin-bottom:14px}
.related ul{list-style:none}
.related li{border-top:1px solid var(--chalk-06)}
.related a{display:block;padding:16px 0;text-decoration:none;font-family:var(--font-serif);font-size:17px;line-height:1.4;color:var(--chalk-72)}
.related a:hover{color:var(--chalk)}
.pager{display:flex;justify-content:space-between;gap:12px;padding:42px 0 0;border-top:1px solid var(--chalk-12);margin-top:42px}
.pager a{font-size:12px;letter-spacing:.14em;text-transform:uppercase;text-decoration:none;color:var(--chalk-72);border:1px solid var(--chalk-12);padding:11px 18px;border-radius:2px}
.pager a:hover{border-color:var(--amethyst);color:var(--chalk)}
.pager .void{visibility:hidden}
.empty{padding:56px 0;color:var(--chalk-42);font-family:var(--font-serif);font-size:19px}
.notice{margin:40px 0 0;padding:16px 18px;border-left:3px solid var(--gold);background:var(--chalk-06);font-size:13px;line-height:1.6;color:var(--chalk-72)}
.notice strong{color:var(--gold);display:block;margin-bottom:5px;font-size:11px;letter-spacing:.18em;text-transform:uppercase}
footer{margin-top:76px;border-top:1px solid var(--chalk-12);padding:30px 0 46px;font-size:12px;color:var(--chalk-42)}
footer .wrap{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
footer a{color:var(--chalk-72);text-decoration:none}
@media(max-width:640px){.topbar nav{gap:9px 14px;font-size:11px}.hero{padding:48px 0 30px}}
`;

// Import UNICO con las cuatro familias, tal como lo trae el <head> del vFINAL.
// Las cuatro tienen rol exclusivo en el sistema: Cormorant → eyebrows y portadas ·
// EB Garamond → titulares y KPIs · DM Sans → cuerpo, UI y datos · Cinzel → SOLO
// etiquetas y badges. Un wordmark que cae a la serif del sistema se ve casi bien y no lo es.
const FONTS = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&family=Cinzel:wght@400;600&family=DM+Sans:wght@300;400;500;600;700&display=swap';

// `siteName` sale de `config.site_name` si la fila del canal lo trae; si no, del host
// de la URL canónica. En ningún caso de un literal en el repo.
// ── Wordmark — la forma es eje, las letras son instancia ────────────────────────────
//
// El sistema de marca lo declara como HTML/CSS, nunca como imagen. Este modulo NO lo
// lleva escrito: sabe que un wordmark es una secuencia de partes, cada una con un texto,
// un ROL tipografico, un peso, un ROL de color y un tracking. Los valores salen de
// `config.wordmark` de la fila del canal.
//
// Escribir «Forum» y «PHs» aqui seria poner la marca de UNA marca en el renderizador que
// sirve el blog de TRES. Por eso las clases de parte son POSICIONALES y no `.f` / `.ph` /
// `.s` como en el archivo de origen: `.ph` nombra «PH», y eso es instancia.
//
// El color va SIEMPRE por variable, nunca por literal en la regla: un rol conocido se
// resuelve al token del tema (`accent` → `--terra`) y un valor exacto declarado por el
// sistema de marca viaja en su propia custom property. Cablear `#C4622D` en el CSS seria
// instancia en el codigo.

const WM_FONT_ROLES = { display: 'font_display', serif: 'font_serif', sans: 'font_sans' };
const WM_COLOR_VARS = { text: '--chalk', text_2: '--chalk-72', text_3: '--chalk-42', accent: '--terra', warn: '--gold' };
const WM_FALLBACK = { font_display: "'EB Garamond',serif", font_serif: "'Cormorant Garamond',serif", font_sans: "'DM Sans',sans-serif" };
const WM_SIZES = new Set(['xxs', 'xs', 'sm', 'md', 'lg', 'xl']);

// Una parte invalida se descarta y se anota; no se dibuja a medias ni tumba la pagina.
export function wordmarkParts(config) {
  const raw = config?.wordmark?.parts;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const theme = (config?.theme && typeof config.theme === 'object') ? config.theme : {};
  const parts = [];
  for (const p of raw) {
    const text = typeof p?.text === 'string' ? p.text : '';
    if (!text) continue;
    const fontKey = WM_FONT_ROLES[p?.font] ?? WM_FONT_ROLES.sans;
    const family = theme[fontKey] ? `'${String(theme[fontKey]).replace(/'/g, '')}',serif` : WM_FALLBACK[fontKey];
    const hex = /^#[0-9A-Fa-f]{3,8}$/.test(String(p?.color ?? '')) ? String(p.color) : null;
    parts.push({
      text,
      family,
      weight: Number.isFinite(Number(p?.weight)) ? Math.round(Number(p.weight)) : 400,
      color: hex ?? (WM_COLOR_VARS[p?.color] ? `var(${WM_COLOR_VARS[p.color]})` : `var(${WM_COLOR_VARS.text})`),
      tracking: /^-?[0-9.]{1,6}em$/.test(String(p?.tracking ?? '')) ? String(p.tracking) : '0',
    });
  }
  return parts.length ? parts : null;
}

// Reglas por parte, generadas del dato. La GEOMETRIA no se genera: vive en `.wm` del
// bloque STYLE, que es eje y no depende de ninguna marca.
export function wordmarkStyle(config) {
  const parts = wordmarkParts(config);
  if (!parts) return '';
  const vars = parts.map((p, i) => `--wm-c${i}:${p.color}`).join(';');
  const rules = parts.map((p, i) =>
    `.wm>span:nth-child(${i + 1}){font-family:${p.family};font-weight:${p.weight};`
    + `letter-spacing:${p.tracking};color:var(--wm-c${i})}`).join('');
  return `.wm{${vars}}${rules}`;
}

// Devuelve el wordmark, o el nombre del sitio en versalitas si el canal no trae ninguno.
// El respaldo no es un wordmark pobre: es texto declaradamente sin marca, que es lo
// honesto cuando falta el dato.
export function wordmarkHtml(config, { size = 'md' } = {}) {
  const parts = wordmarkParts(config);
  const name = siteNameOf(config);
  if (!parts) {
    return `<span style="font-family:var(--font-display);font-size:15px;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(name)}</span>`;
  }
  const cls = WM_SIZES.has(size) ? size : 'md';
  // `aria-label` con el nombre: un lector de pantalla no debe deletrear las partes.
  return `<span class="wm wm-${cls}" role="img" aria-label="${escapeHtml(name)}">`
    + parts.map((p) => `<span>${escapeHtml(p.text)}</span>`).join('') + '</span>';
}

export function siteNameOf(config) {
  if (config?.site_name) return String(config.site_name);
  try {
    return new URL(config.base_url).hostname.replace(/^www\./, '');
  } catch (_e) {
    return 'Blog';
  }
}

// Locale e idioma salen del canal (`config.locale`), con default declarado. Una marca
// de otro país cambia el dato, no el código.
export function localeOf(config) {
  const raw = String(config?.locale || 'es-PA').trim();
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(raw) ? raw : 'es-PA';
}

// El `lang` del `<html>` es el de LA PIEZA, no el del canal. Una pieza en inglés dentro
// de un canal `es-PA` se declaraba española: eso le dice al rastreador que traduzca lo
// que no hay que traducir y arruina el emparejamiento por idioma.
//
// Cuando la pieza no declara idioma, manda el locale del canal — que es lo que había.
// Cuando coincide en idioma con el canal, gana el locale COMPLETO, porque trae la región
// (`es-PA` es más preciso que `es`). Solo cuando difieren se impone el de la pieza.
export function pageLangOf(config, language = null) {
  const locale = localeOf(config);
  const raw = String(language ?? '').trim();
  if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(raw)) return locale;
  const primary = (s) => s.split('-')[0].toLowerCase();
  return primary(raw) === primary(locale) ? locale : raw;
}

// Rótulo del listado en la navegación estructurada (migas). Sale del canal si la fila lo
// trae; el default es la copia de plantilla de este repo, que es artefacto de una sola
// marca (MULTIBRAND_RULE §3).
export function blogLabelOf(config) {
  const v = config?.blog_label;
  return (typeof v === 'string' && v.trim()) ? v.trim() : 'Artículos';
}

export function page({ config, title, description, canonical, ogType = 'website', ogImage = null, publishedIso = null, modifiedIso = null, structuredData = null, noindex = false, body, schemaFallbacks = [], blogPath = '/blog', language = null, alternates = [], prevUrl = null, nextUrl = null }) {
  const site = siteNameOf(config);
  const locale = pageLangOf(config, language);
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    noindex ? `<meta name="robots" content="noindex,follow">` : `<meta name="robots" content="index,follow,max-image-preview:large">`,
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : '',
    // Paginación declarada: sin `prev`/`next` cada página del listado se lee como una
    // página suelta y compite consigo misma.
    prevUrl ? `<link rel="prev" href="${escapeHtml(prevUrl)}">` : '',
    nextUrl ? `<link rel="next" href="${escapeHtml(nextUrl)}">` : '',
    // Alternates recíprocos. La lista llega vacía mientras no exista el par de idiomas,
    // y entonces acá no se emite absolutamente nada.
    ...alternates.map((a) => `<link rel="alternate" hreflang="${escapeHtml(a.hreflang)}" href="${escapeHtml(a.href)}">`),
    `<meta property="og:type" content="${escapeHtml(ogType)}">`,
    `<meta property="og:site_name" content="${escapeHtml(site)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : '',
    `<meta property="og:locale" content="${escapeHtml(locale.replace('-', '_'))}">`,
    ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : '',
    publishedIso ? `<meta property="article:published_time" content="${escapeHtml(publishedIso)}">` : '',
    modifiedIso ? `<meta property="article:modified_time" content="${escapeHtml(modifiedIso)}">` : '',
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}">` : '',
    // Iconos del sitio. Las RUTAS son eje —convencion que cumple cualquier sitio— y cada
    // despliegue sirve en ellas el icono de SU marca. La imagen es lo que seria literal,
    // y la imagen esta en la raiz del sitio, no aqui.
    `<link rel="icon" href="/favicon.ico" sizes="any">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">`,
    `<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="${FONTS}" rel="stylesheet">`,
    `<style>${STYLE}${wordmarkStyle(config)}</style>`,
    // `structuredData` admite un objeto o varios. Cada tipo va en su propio bloque en
    // vez de anidarse: es lo que los validadores de schema.org leen sin ambigüedad.
    ...[].concat(structuredData ?? []).filter(Boolean)
      .map((sd) => `<script type="application/ld+json">${jsonLd(sd)}</script>`),
  ].filter(Boolean).join('\n');

  // El rastro de degradación viaja en el HTML (comentario, invisible al lector) y en la
  // cabecera `X-Schema-Fallbacks`. Correr degradado se declara, no se silencia.
  const trace = schemaFallbacks.length
    ? `\n<!-- schema_fallbacks: ${escapeHtml(JSON.stringify(schemaFallbacks)).replace(/--/g, '- -')} -->\n`
    : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
${head}
</head>
<body>${trace}
<header class="topbar">
  <div class="wrap">
    <a class="mark" href="/" aria-label="${escapeHtml(site)}">${wordmarkHtml(config, { size: 'md' })}</a>
    <nav>
      <a href="/">Inicio</a>
      <a class="feature" href="${escapeHtml(blogPath)}"${ogType === 'website' ? ' aria-current="page"' : ''}>Sin tecnicismos</a>
      <a href="/#contacto">Diagnóstico gratuito</a>
    </nav>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer>
  <div class="wrap">
    <span>${escapeHtml(site)}</span>
    <span><a href="${escapeHtml(blogPath)}">Todos los artículos</a> · <a href="/#contacto">Contacto</a></span>
  </div>
</footer>
</body>
</html>`;
}

// Cuerpo de texto plano → párrafos. El texto va escapado: nunca se inyecta HTML de la DB.
export function paragraphs(body) {
  const parts = String(body || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('\n');
}

export function formatStamp(iso, config) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(localeOf(config), { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
  } catch (_e) {
    return d.toISOString().slice(0, 10);
  }
}

// Respuesta de fallo RUIDOSO: motivo legible en el cuerpo, `noindex`, sin caché y con
// el mismo motivo ya escrito en el log del servidor.
export function failLoud(res, err, { requestId = null } = {}) {
  const code = err?.code ?? 'UNEXPECTED';
  const detail = err?.detail ?? err?.message ?? String(err);
  const status = err?.status ?? 500;
  console.error(`[blog] ${code}: ${detail}`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('X-Blog-Error', code);
  res.status(status).send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Canal de publicación no resuelto</title>
<style>${STYLE}</style></head>
<body><main class="wrap"><div class="hero">
<div class="eyebrow">${escapeHtml(code)}</div>
<h1>El canal de publicación no está resuelto.</h1>
<p class="lede">${escapeHtml(detail)}</p>
${requestId ? `<p class="meta"><span>request ${escapeHtml(requestId)}</span></p>` : ''}
</div>
<div class="notice"><strong>Por qué no hay contenido</strong>Esta ruta no inventa valores por defecto. Sin la configuración del canal en la base de datos, no hay <em>platform_key</em>, ni URL canónica, ni plantilla — y servir HTML indexable con datos inventados es peor que no servir nada.</div>
</main></body></html>`);
}
