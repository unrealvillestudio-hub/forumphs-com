// api/_render.js — plantilla HTML del renderizador `vercel_html`.
//
// Devuelve HTML COMPLETO en la primera respuesta HTTP. No hay shell estático ni `fetch`
// en cliente: el requisito es SEO-first y un contenido cargado por JS no se indexa de
// forma fiable.
//
// Ningún dominio, ningún nombre de marca y ningún `platform_key` viven aquí. El título
// del sitio y la URL canónica se construyen desde `config` del canal; los tokens de
// color se declaran una sola vez y coinciden con los de `index.html`.

import { emphasisToHtml, stripEmphasis, blocksOf } from './_inline.js';

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
/* Tokens del sistema Amatista Carbon (BluePrints BP_BRAND → palette), los mismos que
   declara index.html. Los NOMBRES de variable son los que ya consume el wordmark
   (WM_COLOR_VARS); los valores son los del BP. MOBILE-FIRST: la base es el teléfono y
   los bloques min-width suman aire y columnas. */
:root{
  --void:#0E1018;--carbon:#1C2233;--graphite:#141927;--surface:#171D2D;
  --amethyst:#5C3472;--am-d:#3A1F4A;--am-l:#EAD9F5;--ame-dim:rgba(92,52,114,0.2);--terra:#C4622D;
  --chalk:#F0EDE8;--chalk-72:rgba(240,237,232,0.78);--chalk-42:#B8B0A8;
  --chalk-12:rgba(240,237,232,0.14);--chalk-06:rgba(240,237,232,0.07);--gold:var(--terra);
  --font-display:'Cinzel',Georgia,serif;--font-serif:'EB Garamond',Georgia,serif;--font-sans:'DM Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --font-editorial:'Cormorant Garamond',Georgia,serif;
  --ease:cubic-bezier(0,0,.2,1);
  --a1:var(--am-l);--a1f:var(--amethyst);--a2:var(--terra);--a2s:rgba(196,98,45,0.26);--a3:#5FB49C;
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{background:var(--void);color:var(--chalk);font-family:var(--font-sans);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;background-image:radial-gradient(ellipse 80% 50% at 100% 0,rgba(92,52,114,0.22),transparent 60%)}
a{color:inherit}
:focus-visible{outline:2px solid var(--am-l);outline-offset:3px;border-radius:2px}
.wrap{max-width:760px;margin:0 auto;padding:0 20px}
/* ── Cabecera. En el teléfono son dos filas y NO es fija: marca + CTA arriba, y debajo
   las dos pestañas a todo el ancho con 48 px de alto — objetivos táctiles de verdad, no
   versalitas de 11 px que caen donde caben. Desde 720 px es una sola fila fija. */
.topbar{border-bottom:1px solid var(--chalk-12);background:rgba(14,16,24,.92);position:relative;z-index:10;-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px)}
.topbar::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,rgba(196,98,45,.6) 30%,rgba(92,52,114,.75) 65%,transparent)}
/* flex con envoltura y min-width:0: con el texto ampliado del teléfono, la marca y el botón
   ya no empujan la cabecera fuera de la pantalla — el botón baja de línea si no cabe. */
.topbar .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 12px;max-width:1080px;padding-top:10px}
.topbar .wrap>*{min-width:0}
.mark{text-decoration:none;display:inline-flex;align-items:center;min-height:48px}
/* ── SISTEMA DE WORDMARK ─────────────────────────────────────────────────────
   Portado de BluePrints/brands/ForumPHs/assets/ForumPHs_Amatista_Carbon_vFINAL.html.
   La GEOMETRIA es eje y vive aqui; los VALORES —texto, familia, peso, color y
   tracking de cada parte— son instancia y salen de config.wordmark del canal.
   Las tres partes comparten el MISMO font-size: es lo que alinea las alturas de
   caja de "Forum" y "PH" y deja la "s" a la altura de x de "orum". No hay
   jerarquia interna, y reducir una parte rompe el sistema. */
${WORDMARK_GEOMETRY}
.mark b{color:var(--terra);font-weight:600}
.topbar .cta,.closing a{position:relative;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:8px 16px;border-radius:6px;color:var(--chalk);font-size:14px;font-weight:600;line-height:1.25;text-align:center;text-decoration:none;text-shadow:0 1px 1px rgba(0,0,0,.35);background:linear-gradient(180deg,#74499C 0%,var(--amethyst) 52%,#4A2A5D 100%);border:1px solid rgba(234,217,245,.34);box-shadow:inset 0 1px 0 rgba(255,255,255,.3),inset 0 -2px 0 rgba(0,0,0,.3),0 1px 1px rgba(0,0,0,.45),0 6px 14px -4px rgba(0,0,0,.6),0 14px 30px -12px rgba(124,74,166,.85);transition:transform .22s var(--ease),box-shadow .22s var(--ease),border-color .18s}
.topbar .cta:active,.closing a:active{transform:translateY(1px) scale(.985);box-shadow:inset 0 2px 8px rgba(0,0,0,.38),0 1px 2px rgba(0,0,0,.4)}
@media(hover:hover) and (pointer:fine){.topbar .cta:hover,.closing a:hover{transform:translateY(-2px);border-color:rgba(234,217,245,.6);box-shadow:inset 0 1px 0 rgba(255,255,255,.36),inset 0 -2px 0 rgba(0,0,0,.3),0 12px 22px -6px rgba(0,0,0,.6),0 22px 46px -12px rgba(150,96,196,.95),0 0 0 4px rgba(92,52,114,.18)}}
.topbar nav{flex:1 0 100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin-top:2px;font-family:var(--font-editorial);font-weight:400;font-size:15px;letter-spacing:.08em;text-transform:uppercase}
.topbar nav a{position:relative;display:flex;align-items:center;justify-content:center;min-height:48px;padding:6px 4px;text-align:center;line-height:1.2;color:var(--chalk-42);text-decoration:none;transition:color .18s var(--ease)}
.topbar nav a::after{content:'';position:absolute;left:18%;right:18%;bottom:0;height:2px;background:currentColor;transform:scaleX(0);transition:transform .25s var(--ease)}
.topbar nav a:hover,.topbar nav a[aria-current]{color:var(--chalk)}
.topbar nav a[aria-current]::after,.topbar nav a:hover::after{transform:scaleX(1)}
/* El enlace activo se distingue por COLOR, no por peso. El sistema asigna a las versales
   con tracking Cormorant, y el import trae 300/400/500: pedir 600 no carga un corte mas
   grueso, hace que el navegador SINTETICE una negrita falsa — se ve casi bien y no es la
   tipografia de la marca. */
.topbar nav a.feature,.topbar nav a.feature:hover,.topbar nav a.feature[aria-current]{color:var(--terra)}
.topbar nav a.feature:hover{filter:brightness(1.18)}
.hero{padding:40px 0 32px;border-bottom:1px solid var(--chalk-06)}
.eyebrow{display:inline-flex;align-items:center;gap:12px;font-family:var(--font-display);font-weight:400;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--terra);margin-bottom:16px}
.eyebrow::before{content:'';width:24px;height:1px;background:currentColor}
h1{font-family:var(--font-serif);font-size:clamp(30px,8vw,48px);font-weight:500;line-height:1.14;letter-spacing:-.01em;text-wrap:balance}
.lede{margin-top:16px;font-size:17px;font-weight:300;line-height:1.7;color:var(--chalk-72);max-width:62ch}
.meta{margin-top:20px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--chalk-42);display:flex;gap:10px 18px;flex-wrap:wrap;align-items:center}
.meta span{display:inline-flex;align-items:center;gap:8px}
.meta a{display:inline-flex;align-items:center;min-height:44px;color:var(--am-l);text-decoration:none}
.meta a:hover{color:var(--chalk)}
.cover{margin:28px 0 0;border:1px solid var(--chalk-12);border-radius:6px;overflow:hidden;background:var(--carbon)}
.cover img{display:block;width:100%;height:auto}
article{padding:32px 0 8px}
article p{font-family:var(--font-serif);font-size:18px;line-height:1.75;color:rgba(240,237,232,.9);margin-bottom:22px}
article p:last-child{margin-bottom:0}
/* min() evita que la columna mínima supere el ancho de un teléfono de 320 px: con 292 px
   fijos, la grilla desbordaba la página en horizontal. */
.list{list-style:none;padding:32px 0 0;display:grid;gap:14px;align-items:start;grid-template-columns:repeat(auto-fill,minmax(min(100%,292px),1fr))}
.card{display:flex;flex-direction:column;text-decoration:none;background:var(--graphite);border:1px solid var(--chalk-12);border-radius:6px;padding:22px 20px 20px;transition:border-color .18s var(--ease),background .18s var(--ease),transform .18s var(--ease)}
.card:hover{border-color:var(--terra);background:var(--surface);transform:translateY(-2px)}
.card .topic{font-family:var(--font-editorial);font-size:13px;font-weight:400;letter-spacing:.18em;text-transform:uppercase;color:var(--terra);margin-bottom:13px}
.card h2{font-family:var(--font-serif);font-size:22px;font-weight:500;line-height:1.26;padding-left:14px;border-left:2px solid var(--terra);margin-bottom:11px}
.card p{font-size:15px;line-height:1.62;color:var(--chalk-72);margin-bottom:16px}
.card .stamp{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--chalk-42)}
/* La imagen es OPCIONAL y refuerza, no gobierna: cuando no existe no se emite nada — ni
   marcador de posición, ni caja vacía, ni alto reservado.
   El align-items:start de la grilla es lo que hace que eso baste: cada tarjeta mide lo
   que mide su contenido. Estirarlas a la altura de la fila abriría, dentro de la tarjeta
   SIN imagen, exactamente el hueco que este bloque prohíbe — el alto lo impondría la
   imagen de la vecina. Las columnas siguen alineadas; solo el borde inferior varía. */
.card .shot{margin-top:16px;border-radius:4px;overflow:hidden}
/* Las imágenes del carril son piezas compuestas con el titular en la franja inferior: se muestran
   enteras, a su propia proporción. Un recorte 16:9 cortaba el texto (Sam, 2026-10-02). */
.card .shot img{display:block;width:100%;height:auto}
.related{margin-top:48px;padding-top:28px;border-top:2px solid var(--amethyst)}
.related h2{font-family:var(--font-display);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--terra);margin-bottom:6px}
.related .why{font-size:14px;color:var(--chalk-42);margin-bottom:10px}
.related ul{list-style:none}
.related li{border-top:1px solid var(--chalk-06)}
.related a{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:56px;padding:14px 0;text-decoration:none;font-family:var(--font-serif);font-size:18px;line-height:1.4;color:var(--chalk-72);transition:color .18s var(--ease)}
.related li a::after{content:'→';font-family:var(--font-sans);color:var(--chalk-42);transition:transform .18s var(--ease),color .18s}
.related a:hover{color:var(--chalk)}
.related li a:hover::after{transform:translateX(3px);color:var(--terra)}
/* Paginación: dos botones de verdad, mitad y mitad, 52 px de alto. */
.pager{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:32px 0 0;border-top:1px solid var(--chalk-12);margin-top:36px}
.pager a{display:flex;align-items:center;justify-content:center;min-height:52px;padding:10px 14px;font-size:14px;font-weight:500;letter-spacing:.04em;text-align:center;text-decoration:none;color:var(--chalk);background:linear-gradient(180deg,rgba(240,237,232,.07),rgba(240,237,232,.02));border:1px solid var(--chalk-12);border-radius:6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 8px 20px -12px rgba(0,0,0,.8);transition:border-color .18s var(--ease),transform .18s var(--ease)}
.pager a:active{transform:translateY(1px)}
.pager a:hover{border-color:var(--am-l);background:var(--surface)}
.pager .void{visibility:hidden}
.empty{padding:48px 0;color:var(--chalk-42);font-family:var(--font-serif);font-size:19px}
.notice{margin:40px 0 0;padding:16px 18px;border-left:3px solid var(--gold);background:var(--chalk-06);font-size:14px;line-height:1.6;color:var(--chalk-72)}
.notice strong{color:var(--gold);display:block;margin-bottom:5px;font-size:11px;letter-spacing:.18em;text-transform:uppercase}
/* Cierre con salida: el lector que terminó de leer tiene a un toque el diagnóstico. */
.closing{margin-top:56px;padding:26px 22px;border:1px solid var(--chalk-12);border-top:3px solid var(--terra);border-radius:6px;background:var(--graphite)}
.closing p{font-family:var(--font-serif);font-size:21px;line-height:1.35;margin-bottom:16px}
.closing a{display:flex;min-height:52px;font-size:15px}
footer{margin-top:64px;background:var(--am-d);border-top:2px solid var(--amethyst);padding:28px 0 calc(36px + env(safe-area-inset-bottom));font-size:13px;color:rgba(240,237,232,.72)}
footer .wrap{display:flex;flex-direction:column;gap:12px}
footer .links{display:flex;flex-wrap:wrap;gap:0 20px}
footer a{display:inline-flex;align-items:center;min-height:44px;color:rgba(240,237,232,.9);text-decoration:none}
footer a:hover{color:#fff}
/* ── Formato editorial (F1, 2026-10-02) — el de la maqueta v4 aprobada ──
   Acentos del BP: Amatista Tint escribe (--a1; Amatista rellena, §18.2), Terra resalta la
   negrita y numera las secciones (--a2), Jade es el punto vivo y el filete (--a3, 7,68:1). */
.eyebrow::before{background:var(--a3)}
article p.lede{font-size:20px;line-height:1.6;color:var(--chalk)}
article strong{color:var(--chalk);font-weight:600;background:linear-gradient(transparent 62%,var(--a2s) 62%) no-repeat;padding:0 .08em}
article .sec{margin:2.4em 0 .9em;display:grid;gap:10px}
article .sec .idx{display:flex;align-items:center;gap:12px;font-family:var(--font-display);font-size:11px;font-weight:400;letter-spacing:.2em;text-transform:uppercase;color:var(--a2)}
article .sec .idx::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,var(--a2),var(--a1f) 40%,transparent);opacity:.55}
article h2{font-family:var(--font-serif);font-weight:500;font-size:clamp(26px,5.2vw,34px);line-height:1.15;color:var(--chalk);text-wrap:balance}
article blockquote.pull{position:relative;margin:2.2em 0;padding:6px 0 6px 26px}
article blockquote.pull::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:2px;background:linear-gradient(180deg,var(--a1f),var(--a2))}
article blockquote.pull p{font-family:var(--font-editorial);font-style:italic;font-weight:400;font-size:clamp(26px,3.6vw,36px);line-height:1.2;color:var(--chalk);margin:0}
article blockquote.pull strong{background:none;color:var(--a1);font-weight:500;padding:0}
article p.closer{font-style:italic;color:var(--chalk-72);margin-top:1.6em}
/* «Sigue leyendo» con la imagen de cada artículo (Sam, 2026-10-02). Sin imagen, la tarjeta
   se apoya en el título y no reserva hueco. */
.related ul{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,220px),1fr))}
.related ul>li{min-width:0;border-top:0}
.related a.rel{display:flex;flex-direction:column;align-items:stretch;justify-content:flex-start;gap:0;height:100%;min-height:0;padding:0;border:1px solid var(--chalk-12);border-radius:6px;overflow:hidden;background:var(--graphite);transition:border-color .18s var(--ease),transform .18s var(--ease)}
.related li a.rel::after{content:none}
.related a.rel:hover{border-color:var(--a3);transform:translateY(-2px)}
.related a.rel .thumb{display:block;overflow:hidden;background:var(--carbon)}
.related a.rel .thumb img{display:block;width:100%;height:auto}
.related a.rel .t{display:block;padding:14px 16px 16px;font-family:var(--font-serif);font-size:18px;line-height:1.35;color:var(--chalk-72)}
.related a.rel:hover .t{color:var(--chalk)}
@media(min-width:720px){
  .wrap{padding:0 28px}
  .topbar{position:sticky;top:0}
  .topbar .wrap{flex-wrap:nowrap;min-height:72px;padding-top:0}
  .mark{margin-right:auto}
  .topbar nav{flex:0 1 auto;display:flex;gap:4px;margin:0;font-size:14px}
  .topbar nav a{white-space:nowrap}
  .topbar .cta{order:3;margin-left:12px;white-space:nowrap}
  .topbar nav a{padding:0 12px}
  .topbar nav a::after{left:12px;right:12px;bottom:10px}
  .hero{padding:64px 0 40px}
  article p{font-size:19px}
  .card{padding:24px 24px 22px}
  footer .wrap{flex-direction:row;justify-content:space-between;align-items:center}
}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition-duration:.01ms!important;animation-duration:.01ms!important}}
`;

// Las cuatro familias del sistema —Cormorant → eyebrows y portadas · EB Garamond →
// titulares y KPIs · DM Sans → cuerpo, UI y datos · Cinzel → SOLO etiquetas y badges—
// servidas desde el PROPIO sitio (`scripts/vendor-site-fonts.mjs`), no desde Google: así
// el blog se ve igual en cualquier navegador y teléfono, y un bloqueador de terceros no
// deja el wordmark en la serif del sistema. Las rutas son convención de despliegue, como
// los iconos: cada sitio sirve en ellas SUS archivos.
const FONTS_CSS = '/assets/site/fonts.css';
const FONT_PRELOADS = ['/assets/site/fonts/dm-sans-400-latin.woff2', '/assets/site/fonts/eb-garamond-500-latin.woff2'];

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
// sistema de marca viaja en su propia custom property. Cablear el hex del acento en el CSS seria
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
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">`,
    `<meta name="theme-color" content="#0E1018">`,
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
    ...FONT_PRELOADS.map((f) => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`),
    `<link rel="stylesheet" href="${FONTS_CSS}">`,
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
    <a class="cta" href="/#contacto">Diagnóstico gratuito</a>
    <nav aria-label="Navegación del blog">
      <a href="/">Inicio</a>
      <a class="feature" href="${escapeHtml(blogPath)}"${ogType === 'website' ? ' aria-current="page"' : ''}>Sin tecnicismos</a>
    </nav>
  </div>
</header>
<main class="wrap">
${body}
<aside class="closing" aria-label="Contacto">
  <p>¿Quiere saber cómo está su edificio? Empiece por un diagnóstico.</p>
  <a href="/#contacto">Solicitar diagnóstico gratuito →</a>
</aside>
</main>
<footer>
  <div class="wrap">
    <span>${escapeHtml(site)}</span>
    <div class="links"><a href="/">Inicio</a><a href="${escapeHtml(blogPath)}">Todos los artículos</a><a href="/#contacto">Contacto</a></div>
  </div>
</footer>
</body>
</html>`;
}

// Cuerpo de texto plano → párrafos. El texto va escapado: nunca se inyecta HTML de la DB.
// La negrita (`**texto**`) se traduce DESPUÉS de escapar, sobre el texto ya inerte: ver
// `_inline.js`.
export function paragraphs(body) {
  const blocks = blocksOf(body);
  if (!blocks.length) return '';
  // Formato editorial (F1, 2026-10-02): el primer párrafo es la entradilla; cada `##` abre
  // una sección numerada; `>` es la cita destacada. El último párrafo que empieza con raya
  // (—) es el cierre de firma de la marca y se compone aparte.
  const inline = (t) => emphasisToHtml(escapeHtml(t)).replace(/\n/g, '<br>');
  const lastP = blocks.map((b) => b.t).lastIndexOf('p');
  let firstP = true;
  let sec = 0;
  return blocks.map((b, i) => {
    if (b.t === 'h') {
      sec += 1;
      // El subtítulo no lleva negrita: ya es un titular. Se quitan los `**` sin pintarlos.
      return `<div class="sec"><span class="idx" aria-hidden="true">§ ${String(sec).padStart(2, '0')}</span><h2>${escapeHtml(stripEmphasis(b.text))}</h2></div>`;
    }
    if (b.t === 'quote') return `<blockquote class="pull"><p>${inline(b.text)}</p></blockquote>`;
    let cls = '';
    if (firstP) { cls = ' class="lede"'; firstP = false; }
    else if (i === lastP && /^[—–]\s/.test(b.text)) cls = ' class="closer"';
    return `<p${cls}>${inline(b.text)}</p>`;
  }).join('\n');
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
