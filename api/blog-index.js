// api/blog-index.js — listado del blog. HTML COMPLETO en la primera respuesta.
//
// Verificable sin JS:  curl -s https://<host>/blog | grep '<h2'

import { resolveChannel, fetchPieces, ChannelError } from './_channel.js';
import { page, escapeHtml, formatStamp, absoluteUrl, siteNameOf, failLoud } from './_render.js';

const PROVIDER = 'vercel_html';
const BLOG_PATH = '/blog';

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

    if (String(req.query?.debug ?? '') === 'schema') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({
        provider: channel.provider,
        degraded: channel.degraded,
        platform_key_resolved: Boolean(channel.platformKey),
        config_defaults: channel.config_defaults,
        schema_fallbacks,
        pieces: shown.length,
      });
    }

    const title = pageNum > 1
      ? `Artículos — página ${pageNum} · ${site}`
      : `Artículos · ${site}`;
    const description = config.description
      ? String(config.description)
      : `Artículos publicados por ${site}.`;

    const cards = shown.map((p) => {
      const stamp = formatStamp(p.published_iso, config);
      return `  <a class="card" href="${escapeHtml(`${BLOG_PATH}/${p.slug}`)}">
    ${stamp ? `<span class="stamp">${escapeHtml(stamp)}</span>` : ''}
    <h2>${escapeHtml(p.title)}</h2>
    <p>${escapeHtml(p.excerpt)}</p>
  </a>`;
    }).join('\n');

    const pager = (pageNum > 1 || hasNext)
      ? `<div class="pager">
  ${pageNum > 1 ? `<a href="${escapeHtml(pageNum - 1 === 1 ? BLOG_PATH : `${BLOG_PATH}?page=${pageNum - 1}`)}" rel="prev">← Más recientes</a>` : `<a class="void" href="${BLOG_PATH}">·</a>`}
  ${hasNext ? `<a href="${escapeHtml(`${BLOG_PATH}?page=${pageNum + 1}`)}" rel="next">Anteriores →</a>` : `<a class="void" href="${BLOG_PATH}">·</a>`}
</div>`
      : '';

    const body = `<div class="hero">
  <div class="eyebrow">Artículos</div>
  <h1>${escapeHtml(pageNum > 1 ? `Artículos — página ${pageNum}` : 'Artículos')}</h1>
  <p class="lede">${escapeHtml(description)}</p>
</div>
${shown.length ? `<div class="list">\n${cards}\n</div>` : '<p class="empty">Todavía no hay artículos publicados en este canal.</p>'}
${pager}`;

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: title,
      description,
      url: canonical,
      inLanguage: config.locale || 'es-PA',
      publisher: { '@type': 'Organization', name: site, url: config.base_url },
      blogPost: shown.map((p) => ({
        '@type': 'BlogPosting',
        headline: p.title,
        url: absoluteUrl(config.base_url, `${BLOG_PATH}/${p.slug}`),
        ...(p.published_iso ? { datePublished: p.published_iso } : {}),
      })),
    };

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
      body,
    }));
  } catch (e) {
    return failLoud(res, e instanceof ChannelError ? e : { code: 'UNEXPECTED', detail: e?.message ?? String(e), status: 500 });
  }
}
