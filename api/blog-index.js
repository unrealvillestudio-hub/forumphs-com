// api/blog-index.js — listado del blog. HTML COMPLETO en la primera respuesta.
//
// Verificable sin JS:  curl -s https://<host>/blog | grep '<h2'

import { resolveChannel, fetchPieces, ChannelError } from './_channel.js';
import { page, escapeHtml, formatStamp, absoluteUrl, siteNameOf, blogLabelOf, localeOf, failLoud } from './_render.js';

const PROVIDER = 'vercel_html';
const BLOG_PATH = '/blog';

// Textos de plantilla de ESTE repo, que es artefacto exclusivo de marca (MULTIBRAND_RULE
// §3): el sitio de una sola marca. No gobiernan comportamiento, no viajan a ninguna capa
// compartida y no van a la base — son la copia de la portada del listado, igual que
// «Inicio» o «Diagnóstico gratuito» ya lo son en la plantilla.
//
// El rótulo de interfaz y la URL están DESACOPLADOS a propósito: `/blog` es activo de
// SEO y no se mueve; cómo se llama el enlace es decisión editorial.
const LIST_HEADING = 'Hablemos sin tecnicismos';
const LIST_LEDE = 'En su edificio se toman decisiones con documentos, cifras y plazos que casi nadie le explicó. Aquí los explicamos uno por uno, en el idioma en que se habla, para que llegue a la próxima asamblea sabiendo qué preguntar.';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const channel = await resolveChannel({ provider: PROVIDER, req });
    const { config } = channel;

    const perPage = config.items_per_page;
    const pageNum = Math.max(1, Number.parseInt(String(req.query?.page ?? '1'), 10) || 1);
    const offset = (pageNum - 1) * perPage;

    // Se pide una pieza de más que las de la página: así se sabe si hay página siguiente
    // sin una segunda consulta de conteo.
    const { pieces, schema_fallbacks } = await fetchPieces(channel, { limit: perPage + 1, offset });
    const hasNext = pieces.length > perPage;
    const shown = pieces.slice(0, perPage);

    const canonicalPath = pageNum > 1 ? `${BLOG_PATH}?page=${pageNum}` : BLOG_PATH;
    const canonical = absoluteUrl(config.base_url, canonicalPath);
    const site = siteNameOf(config);

    // La página 1 vive en `/blog` sin parámetro: la ruta hacia atrás desde la 2 tiene que
    // apuntar ahí y no a `?page=1`, o se declara como canónica una URL que la propia
    // página 1 no reconoce como suya.
    const pagePath = (n) => (n <= 1 ? BLOG_PATH : `${BLOG_PATH}?page=${n}`);
    const prevUrl = pageNum > 1 ? absoluteUrl(config.base_url, pagePath(pageNum - 1)) : null;
    const nextUrl = hasNext ? absoluteUrl(config.base_url, pagePath(pageNum + 1)) : null;

    if (String(req.query?.debug ?? '') === 'schema') {
      res.setHeader('Cache-Control', 'no-store');
      // `no-store` evita la caché, no al rastreador: sin esta cabecera la vista de
      // diagnóstico es una URL indexable que expone el estado interno del canal.
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return res.status(200).json({
        provider: channel.provider,
        degraded: channel.degraded,
        platform_key_resolved: Boolean(channel.platformKey),
        config_defaults: channel.config_defaults,
        schema_fallbacks,
        pieces: shown.length,
      });
    }

    // Un solo rótulo para el listado: el mismo que lleva la miga del artículo. Dos
    // fuentes para el mismo nombre es la puerta por la que se cuelan dos nombres.
    const blogLabel = blogLabelOf(config);
    const title = pageNum > 1
      ? `${blogLabel} — página ${pageNum} · ${site}`
      : `${blogLabel} · ${site}`;
    // La bajada visible es la de plantilla. `config.description`, si el canal la trae,
    // sigue gobernando la meta description: es dato de SEO del canal y manda sobre la
    // copia del repo.
    const description = config.description ? String(config.description) : LIST_LEDE;

    // Orden de la tarjeta: etiqueta de tema · título · extracto · fecha · imagen.
    //
    // Cada bloque se emite SOLO si tiene contenido. La etiqueta viene de `public_label`
    // resuelto por `brand_id` desde la tabla — si el catálogo no la trajo, la tarjeta se
    // apoya en la jerarquía tipográfica y no imprime nada. La imagen es opcional por
    // requisito, no por descuido: sin `assets.image.url` no se emite ni contenedor ni
    // marcador de posición.
    const cards = shown.map((p) => {
      const stamp = formatStamp(p.published_iso, config);
      return [
        `  <a class="card" href="${escapeHtml(`${BLOG_PATH}/${p.slug}`)}">`,
        p.public_label ? `    <span class="topic">${escapeHtml(p.public_label)}</span>` : '',
        `    <h2>${escapeHtml(p.title)}</h2>`,
        p.excerpt ? `    <p>${escapeHtml(p.excerpt)}</p>` : '',
        stamp ? `    <span class="stamp">${escapeHtml(stamp)}</span>` : '',
        p.image_url
          ? `    <span class="shot"><img src="${escapeHtml(p.image_url)}" alt="" loading="lazy" decoding="async"></span>`
          : '',
        `  </a>`,
      ].filter(Boolean).join('\n');
    }).join('\n');

    const pager = (pageNum > 1 || hasNext)
      ? `<div class="pager">
  ${pageNum > 1 ? `<a href="${escapeHtml(pagePath(pageNum - 1))}" rel="prev">← Más recientes</a>` : `<a class="void" href="${BLOG_PATH}">·</a>`}
  ${hasNext ? `<a href="${escapeHtml(pagePath(pageNum + 1))}" rel="next">Anteriores →</a>` : `<a class="void" href="${BLOG_PATH}">·</a>`}
</div>`
      : '';

    const body = `<div class="hero">
  <div class="eyebrow">${escapeHtml(blogLabel)}</div>
  <h1>${escapeHtml(pageNum > 1 ? `${LIST_HEADING} — página ${pageNum}` : LIST_HEADING)}</h1>
  <p class="lede">${escapeHtml(LIST_LEDE)}</p>
</div>
${shown.length ? `<div class="list">\n${cards}\n</div>` : '<p class="empty">Todavía no hay artículos publicados en este canal.</p>'}
${pager}`;

    // El logo es del CANAL, no del repo: si la fila no lo trae, `Organization` sale sin
    // logo en vez de con una ruta inventada que devolvería 404 al rastreador.
    const rawLogo = typeof config.logo_url === 'string' ? config.logo_url.trim() : '';
    const logoUrl = rawLogo
      ? (/^https?:\/\//i.test(rawLogo) ? rawLogo : absoluteUrl(config.base_url, rawLogo))
      : null;
    const organization = {
      '@type': 'Organization',
      name: site,
      url: config.base_url,
      ...(logoUrl ? { logo: { '@type': 'ImageObject', url: logoUrl } } : {}),
    };

    const articleUrl = (p) => absoluteUrl(config.base_url, `${BLOG_PATH}/${p.slug}`);

    const structuredData = [{
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: title,
      description,
      url: canonical,
      inLanguage: localeOf(config),
      publisher: organization,
      blogPost: shown.map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: articleUrl(p),
        ...(p.published_iso ? { datePublished: p.published_iso } : {}),
        ...(p.modified_iso ? { dateModified: p.modified_iso } : {}),
        ...(p.image_url ? { image: [p.image_url] } : {}),
      })),
    }, {
      // `ItemList` con las piezas de ESTA página: es lo que hace que el índice se lea como
      // un listado ordenado y no como una página suelta. Las posiciones son absolutas
      // dentro del catálogo, no relativas a la página, para que la 2 no repita 1..N.
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: title,
      url: canonical,
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: shown.length,
      itemListElement: shown.map((p, i) => ({
        '@type': 'ListItem',
        position: offset + i + 1,
        name: p.title,
        url: articleUrl(p),
      })),
    }, {
      '@context': 'https://schema.org',
      ...organization,
    }, {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: site,
      url: config.base_url,
      inLanguage: localeOf(config),
      publisher: organization,
    }];

    for (const f of schema_fallbacks) console.warn(`[blog-index] ${f.code}: ${f.detail}`);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    if (schema_fallbacks.length) res.setHeader('X-Schema-Fallbacks', String(schema_fallbacks.length));
    return res.status(200).send(page({
      config, title, description, canonical,
      ogType: 'website',
      structuredData,
      schemaFallbacks: schema_fallbacks,
      blogPath: BLOG_PATH,
      prevUrl,
      nextUrl,
      body,
    }));
  } catch (e) {
    return failLoud(res, e instanceof ChannelError ? e : { code: 'UNEXPECTED', detail: e?.message ?? String(e), status: 500 });
  }
}
