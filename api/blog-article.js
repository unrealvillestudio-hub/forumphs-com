// api/blog-article.js — artículo. HTML COMPLETO en la primera respuesta.
//
// Un slug inexistente devuelve 404 REAL. Un 200 con cuerpo vacío se indexa y envenena
// el índice: está prohibido.
//
// Verificable sin JS:  curl -s -o /dev/null -w '%{http_code}' https://<host>/blog/no-existe  → 404

import { resolveChannel, fetchPieces, ChannelError } from './_channel.js';
import { page, paragraphs, escapeHtml, formatStamp, absoluteUrl, siteNameOf, failLoud } from './_render.js';

const PROVIDER = 'vercel_html';
const BLOG_PATH = '/blog';

// Techo de la búsqueda por slug derivado. Mientras `content_pieces.slug` no exista, el
// match se hace en memoria sobre la ventana más reciente. Es degradación declarada, no
// una consulta sin límite.
const DERIVED_LOOKUP_WINDOW = 500;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let channel = null;
  try {
    channel = await resolveChannel({ provider: PROVIDER, req });
    const { config } = channel;

    const slug = String(req.query?.slug ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!slug) return notFound(res, channel, slug);

    // Ventana única: el artículo y sus candidatos a enlace interno salen de la misma
    // lectura. Con `slug` real en la DB esto se reduce a un `eq` — hasta entonces el
    // match ocurre aquí y queda declarado en `schema_fallbacks`.
    const { pieces, schema_fallbacks, slug_derived } = await fetchPieces(channel, {
      limit: DERIVED_LOOKUP_WINDOW,
      offset: 0,
    });

    if (slug_derived) {
      schema_fallbacks.push({
        code: 'SCHEMA_FALLBACK',
        detail: `sin columna slug: el artículo se resuelve por slug derivado sobre las ${DERIVED_LOOKUP_WINDOW} piezas publicadas más recientes de este canal`,
      });
    }

    const piece = pieces.find((p) => p.slug === slug);
    for (const f of schema_fallbacks) console.warn(`[blog-article] ${f.code}: ${f.detail}`);

    if (!piece || !piece.body) {
      // Sin cuerpo no hay artículo. Servir un 200 vacío sería peor que el 404.
      return notFound(res, channel, slug, schema_fallbacks);
    }

    const canonical = absoluteUrl(config.base_url, `${BLOG_PATH}/${piece.slug}`);
    const site = siteNameOf(config);
    const stamp = formatStamp(piece.published_iso, config);

    // ── Enlaces internos — HR-FPHS-08 (`blog_enlace_interno`) ────────────────────────
    // Toda pieza de blog cierra invitando a otro artículo del genoma, jamás callejón sin
    // salida. Primero hermanas del mismo `domain`; si no alcanzan, se completa con las
    // más recientes del canal, porque un bloque vacío sería exactamente el callejón que
    // la regla prohíbe.
    const wanted = config.related_count;
    const others = pieces.filter((p) => p.id !== piece.id);
    const sameGenome = others.filter((p) => p.domain && p.domain === piece.domain);
    const related = [...sameGenome];
    for (const p of others) {
      if (related.length >= wanted) break;
      if (!related.some((r) => r.id === p.id)) related.push(p);
    }
    const relatedShown = related.slice(0, wanted);

    const relatedBlock = relatedShown.length
      ? `<section class="related">
  <h2>Siga leyendo</h2>
  <p class="why">Del mismo tema, o lo más reciente del canal.</p>
  <ul>
${relatedShown.map((p) => `    <li><a href="${escapeHtml(`${BLOG_PATH}/${p.slug}`)}">${escapeHtml(p.title)}</a></li>`).join('\n')}
  </ul>
</section>`
      : `<section class="related">
  <h2>Siga leyendo</h2>
  <p class="why"><a href="${BLOG_PATH}">Todos los artículos</a></p>
</section>`;

    const body = `<div class="hero">
  <div class="eyebrow">Artículo</div>
  <h1>${escapeHtml(piece.title)}</h1>
  <div class="meta">
    ${stamp ? `<span>${escapeHtml(stamp)}</span>` : ''}
    <span><a href="${BLOG_PATH}">Todos los artículos</a></span>
  </div>
  ${piece.image_url ? `<div class="cover"><img src="${escapeHtml(piece.image_url)}" alt="${escapeHtml(piece.title)}" loading="lazy" decoding="async"></div>` : ''}
</div>
<article>
${paragraphs(piece.body)}
</article>
${relatedBlock}`;

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: piece.title,
      description: piece.excerpt,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      url: canonical,
      inLanguage: config.locale || 'es-PA',
      ...(piece.published_iso ? { datePublished: piece.published_iso, dateModified: piece.published_iso } : {}),
      ...(piece.image_url ? { image: [piece.image_url] } : {}),
      author: { '@type': 'Organization', name: site, url: config.base_url },
      publisher: { '@type': 'Organization', name: site, url: config.base_url },
      ...(piece.domain ? { articleSection: piece.domain } : {}),
    };

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    if (schema_fallbacks.length) res.setHeader('X-Schema-Fallbacks', String(schema_fallbacks.length));
    return res.status(200).send(page({
      config,
      title: `${piece.title} · ${site}`,
      description: piece.excerpt,
      canonical,
      ogType: 'article',
      ogImage: piece.image_url,
      publishedIso: piece.published_iso,
      structuredData,
      schemaFallbacks: schema_fallbacks,
      blogPath: BLOG_PATH,
      body,
    }));
  } catch (e) {
    return failLoud(res, e instanceof ChannelError ? e : { code: 'UNEXPECTED', detail: e?.message ?? String(e), status: 500 });
  }
}

// 404 real: status 404, `noindex`, y una salida hacia el listado — ni siquiera el error
// es un callejón sin salida. Caché corta a propósito: un 404 con la caché larga del
// artículo se quedaría pegado cuando la pieza sí se publique.
function notFound(res, channel, slug, schemaFallbacks = []) {
  const config = channel?.config ?? { base_url: '' };
  const site = siteNameOf(config);
  console.warn(`[blog-article] NOT_FOUND: slug='${slug}' no corresponde a ninguna pieza publicada de este canal`);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (schemaFallbacks.length) res.setHeader('X-Schema-Fallbacks', String(schemaFallbacks.length));
  return res.status(404).send(page({
    config,
    title: `Artículo no encontrado · ${site}`,
    description: 'La dirección solicitada no corresponde a ningún artículo publicado.',
    canonical: null,
    noindex: true,
    schemaFallbacks,
    blogPath: BLOG_PATH,
    body: `<div class="hero">
  <div class="eyebrow">404</div>
  <h1>Ese artículo no existe.</h1>
  <p class="lede">La dirección solicitada no corresponde a ningún artículo publicado en este canal.</p>
  <div class="meta"><span><a href="${BLOG_PATH}">Ver todos los artículos</a></span></div>
</div>`,
  }));
}
