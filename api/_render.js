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

const STYLE = `
:root{
  --void:#0A090C;--carbon:#111018;--graphite:#1C1A26;--surface:#231F30;
  --amethyst:#7C3AED;--ame-dim:rgba(124,58,237,0.15);--terra:#C4622D;
  --chalk:#F9F8FF;--chalk-72:rgba(249,248,255,0.72);--chalk-42:rgba(249,248,255,0.42);
  --chalk-12:rgba(249,248,255,0.12);--chalk-06:rgba(249,248,255,0.06);--gold:#D4A853;
  --font-display:'Cinzel',serif;--font-serif:'EB Garamond',serif;--font-sans:'DM Sans',sans-serif;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
body{background:var(--void);color:var(--chalk);font-family:var(--font-sans);-webkit-font-smoothing:antialiased}
a{color:inherit}
.wrap{max-width:760px;margin:0 auto;padding:0 24px}
.topbar{border-bottom:1px solid var(--chalk-12);background:rgba(10,9,12,.88);position:sticky;top:0;z-index:10;backdrop-filter:blur(10px)}
.topbar .wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;height:64px;max-width:1080px}
.mark{font-family:var(--font-display);font-size:15px;letter-spacing:.12em;text-transform:uppercase;text-decoration:none}
.mark b{color:var(--terra);font-weight:600}
.topbar nav{display:flex;gap:22px;font-size:12px;letter-spacing:.08em;text-transform:uppercase}
.topbar nav a{color:var(--chalk-42);text-decoration:none}
.topbar nav a:hover,.topbar nav a[aria-current]{color:var(--chalk)}
.topbar nav a.feature,.topbar nav a.feature:hover,.topbar nav a.feature[aria-current]{color:var(--terra);font-weight:600}
.topbar nav a.feature:hover{filter:brightness(1.18)}
.hero{padding:72px 0 40px;border-bottom:1px solid var(--chalk-06)}
.eyebrow{font-family:var(--font-display);font-size:10px;letter-spacing:.34em;text-transform:uppercase;color:var(--terra);margin-bottom:18px}
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
.card .topic{font-size:10px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:var(--terra);margin-bottom:13px}
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
@media(max-width:640px){.topbar nav{gap:14px;font-size:11px}.hero{padding:48px 0 30px}}
`;

const FONTS = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500;600&display=swap';

// `siteName` sale de `config.site_name` si la fila del canal lo trae; si no, del host
// de la URL canónica. En ningún caso de un literal en el repo.
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

export function page({ config, title, description, canonical, ogType = 'website', ogImage = null, publishedIso = null, structuredData = null, noindex = false, body, schemaFallbacks = [], blogPath = '/blog' }) {
  const site = siteNameOf(config);
  const locale = localeOf(config);
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    noindex ? `<meta name="robots" content="noindex,follow">` : `<meta name="robots" content="index,follow,max-image-preview:large">`,
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : '',
    `<meta property="og:type" content="${escapeHtml(ogType)}">`,
    `<meta property="og:site_name" content="${escapeHtml(site)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : '',
    `<meta property="og:locale" content="${escapeHtml(locale.replace('-', '_'))}">`,
    ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : '',
    publishedIso ? `<meta property="article:published_time" content="${escapeHtml(publishedIso)}">` : '',
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}">` : '',
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link href="${FONTS}" rel="stylesheet">`,
    `<style>${STYLE}</style>`,
    structuredData ? `<script type="application/ld+json">${jsonLd(structuredData)}</script>` : '',
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
    <a class="mark" href="/">${escapeHtml(site)}</a>
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
