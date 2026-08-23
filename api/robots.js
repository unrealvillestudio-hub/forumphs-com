// api/robots.js — robots.txt. La línea Sitemap se construye desde `config.base_url`
// del canal, jamás desde un dominio literal en el repo.

import { resolveChannel, ChannelError } from './_channel.js';
import { absoluteUrl, failLoud } from './_render.js';

const PROVIDER = 'vercel_html';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { config } = await resolveChannel({ provider: PROVIDER, req });
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /api/',
      '',
      `Sitemap: ${absoluteUrl(config.base_url, '/sitemap.xml')}`,
      '',
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    return res.status(200).send(body);
  } catch (e) {
    return failLoud(res, e instanceof ChannelError ? e : { code: 'UNEXPECTED', detail: e?.message ?? String(e), status: 500 });
  }
}
