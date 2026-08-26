// api/sitemap.js — sitemap generado de la MISMA consulta que sirve el listado.
// Un sitemap que no sale de la misma fuente se desincroniza y termina publicando 404s.

import { resolveChannel, fetchPieces, ChannelError } from './_channel.js';
import { escapeHtml, absoluteUrl, failLoud } from './_render.js';

const PROVIDER = 'vercel_html';
const BLOG_PATH = '/blog';
const MAX_URLS = 5000;

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const channel = await resolveChannel({ provider: PROVIDER, req });
    const { config } = channel;
    const { pieces, schema_fallbacks } = await fetchPieces(channel, { limit: MAX_URLS, offset: 0 });
    for (const f of schema_fallbacks) console.warn(`[sitemap] ${f.code}: ${f.detail}`);

    const urls = [
      { loc: absoluteUrl(config.base_url, '/'), priority: '1.0', changefreq: 'monthly' },
      { loc: absoluteUrl(config.base_url, BLOG_PATH), priority: '0.9', changefreq: 'weekly' },
      // `lastmod` es el sello REAL de la pieza —el más reciente entre publicación y
      // edición—, el mismo que declara `dateModified`. Enviar siempre la fecha de
      // publicación le diría al rastreador que no vuelva a leer algo que sí cambió.
      //
      // El filtro de descartadas es el de `fetchPieces`: una pieza retirada no aparece
      // acá. Corregir solo el listado la habría dejado fuera del índice pero VIVA y
      // enviada a Google desde este archivo, que es peor que no corregir nada.
      ...pieces.map((p) => ({
        loc: absoluteUrl(config.base_url, `${BLOG_PATH}/${p.slug}`),
        lastmod: (p.modified_iso || p.published_iso)?.slice(0, 10) ?? null,
        priority: '0.8',
        changefreq: 'monthly',
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${escapeHtml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${escapeHtml(u.lastmod)}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    if (schema_fallbacks.length) res.setHeader('X-Schema-Fallbacks', String(schema_fallbacks.length));
    return res.status(200).send(xml);
  } catch (e) {
    return failLoud(res, e instanceof ChannelError ? e : { code: 'UNEXPECTED', detail: e?.message ?? String(e), status: 500 });
  }
}
