// api/blog-article.js — artículo. HTML COMPLETO en la primera respuesta.
//
// Un slug inexistente devuelve 404 REAL. Un 200 con cuerpo vacío se indexa y envenena
// el índice: está prohibido.
//
// Una pieza DESCARTADA es un tercer caso, y no es ninguno de los dos anteriores: existió,
// se sirvió, Google pudo indexarla, y se retiró. Eso es 410 Gone. El 404 le dice al
// rastreador «puede que vuelva» y la URL sobrevive meses en el índice; el 410 le dice
// «se fue» y la retira en días. La diferencia entre los dos es la única palanca que
// tiene el renderizador para desindexar algo que ya salió.
//
// Verificable sin JS:  curl -s -o /dev/null -w '%{http_code}' https://<host>/blog/no-existe  → 404
//                      curl -s -o /dev/null -w '%{http_code}' https://<host>/blog/<descartada> → 410

import { resolveChannel, fetchPieces, translationAlternates, ChannelError } from './_channel.js';
import { page, paragraphs, escapeHtml, formatStamp, absoluteUrl, siteNameOf, blogLabelOf, localeOf, pageLangOf, failLoud } from './_render.js';

const PROVIDER = 'vercel_html';
const BLOG_PATH = '/blog';

// Techo de la búsqueda por slug derivado. Mientras `content_pieces.slug` no exista, el
// match se hace en memoria sobre la ventana más reciente. Es degradación declarada, no
// una consulta sin límite.
//
// El mismo techo acota la búsqueda de piezas DESCARTADAS: pasadas las 500 más recientes,
// una URL retirada vuelve a responder 404 en vez de 410. Se prefiere ese techo a una
// consulta abierta — el 404 desindexa más lento, pero no publica nada.
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
      // Antes de dar el slug por inexistente hay que preguntar si EXISTIÓ. Esta segunda
      // lectura solo ocurre en el camino de fallo —el listado y el sitemap no la pagan— y
      // es la que separa el 410 del 404.
      const { pieces: retired } = await fetchPieces(channel, {
        limit: DERIVED_LOOKUP_WINDOW,
        offset: 0,
        discarded: 'only',
      });
      if (retired.some((p) => p.slug === slug)) return gone(res, channel, slug, schema_fallbacks);
      // Sin cuerpo no hay artículo. Servir un 200 vacío sería peor que el 404.
      return notFound(res, channel, slug, schema_fallbacks);
    }

    const canonical = absoluteUrl(config.base_url, `${BLOG_PATH}/${piece.slug}`);
    const site = siteNameOf(config);
    const stamp = formatStamp(piece.published_iso, config);
    const pageLang = pageLangOf(config, piece.language);

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

    // ── hreflang ────────────────────────────────────────────────────────────────────
    // Recíproco o nada. La lista sale de las piezas que comparten `translation_key` con
    // ésta dentro de la MISMA ventana ya leída: cada URL emitida es una URL que este
    // mismo renderizador sabe servir. Mientras nadie estampe esa clave, `alternates`
    // queda vacío y en el `<head>` no aparece ni una etiqueta.
    const alternates = translationAlternates(pieces, piece, localeOf(config))
      .map((a) => ({ hreflang: a.hreflang, href: absoluteUrl(config.base_url, `${BLOG_PATH}/${a.slug}`) }));

    // `BlogPosting`, no `Article`: es subclase suya, así que no se pierde nada declarado y
    // se gana precisión sobre qué clase de página es ésta.
    const structuredData = [{
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: piece.title,
      description: piece.excerpt,
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      url: canonical,
      // El idioma de la PIEZA, con el del canal como respaldo — el mismo criterio que
      // gobierna el `lang` del `<html>`, para que los dos no puedan contradecirse.
      inLanguage: pageLang,
      ...(piece.published_iso ? { datePublished: piece.published_iso } : {}),
      // `dateModified` real: sale del sello más reciente de la pieza, no de una copia de
      // `datePublished`.
      ...(piece.modified_iso ? { dateModified: piece.modified_iso } : {}),
      ...(piece.image_url ? { image: [piece.image_url] } : {}),
      author: { '@type': 'Organization', name: site, url: config.base_url },
      publisher: { '@type': 'Organization', name: site, url: config.base_url },
      ...(piece.domain ? { articleSection: piece.domain } : {}),
    }, {
      // Migas: portada → listado → este artículo. Los tres niveles salen de datos que ya
      // están resueltos; ninguno se inventa.
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: site, item: absoluteUrl(config.base_url, '/') },
        { '@type': 'ListItem', position: 2, name: blogLabelOf(config), item: absoluteUrl(config.base_url, BLOG_PATH) },
        { '@type': 'ListItem', position: 3, name: piece.title, item: canonical },
      ],
    }];

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
      modifiedIso: piece.modified_iso,
      language: piece.language,
      alternates,
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
  console.warn(`[blog-article] NOT_FOUND: slug='${slug}' no corresponde a ninguna pieza publicada de este canal`);
  return retiredOrMissing(res, channel, schemaFallbacks, {
    status: 404,
    eyebrow: '404',
    heading: 'Ese artículo no existe.',
    lede: 'La dirección solicitada no corresponde a ningún artículo publicado en este canal.',
    title: 'Artículo no encontrado',
    description: 'La dirección solicitada no corresponde a ningún artículo publicado.',
  });
}

// 410 Gone: la pieza EXISTIÓ en esta URL y se retiró. No es lo mismo que el 404 y no se
// puede servir como tal — con 404 el rastreador supone un fallo temporal y conserva la
// URL indexada; con 410 la retira. La caché es igual de corta que la del 404 a propósito:
// deshacer el descarte tiene que verse enseguida.
function gone(res, channel, slug, schemaFallbacks = []) {
  console.warn(`[blog-article] GONE: slug='${slug}' corresponde a una pieza descartada; se responde 410 para que el buscador la retire del índice`);
  return retiredOrMissing(res, channel, schemaFallbacks, {
    status: 410,
    eyebrow: '410',
    heading: 'Ese artículo se retiró.',
    lede: 'Esta dirección tuvo un artículo que ya no está publicado. No va a volver a esta dirección.',
    title: 'Artículo retirado',
    description: 'Esta dirección tuvo un artículo que ya no está publicado.',
  });
}

// Las dos salidas comparten cuerpo: `noindex`, sin URL canónica —canonizar una página de
// error la vuelve indexable— y siempre un enlace de vuelta al listado.
function retiredOrMissing(res, channel, schemaFallbacks, { status, eyebrow, heading, lede, title, description }) {
  const config = channel?.config ?? { base_url: '' };
  const site = siteNameOf(config);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=60');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (schemaFallbacks.length) res.setHeader('X-Schema-Fallbacks', String(schemaFallbacks.length));
  return res.status(status).send(page({
    config,
    title: `${title} · ${site}`,
    description,
    canonical: null,
    noindex: true,
    schemaFallbacks,
    blogPath: BLOG_PATH,
    body: `<div class="hero">
  <div class="eyebrow">${escapeHtml(eyebrow)}</div>
  <h1>${escapeHtml(heading)}</h1>
  <p class="lede">${escapeHtml(lede)}</p>
  <div class="meta"><span><a href="${BLOG_PATH}">Ver todos los artículos</a></span></div>
</div>`,
  }));
}
