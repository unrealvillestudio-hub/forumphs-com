// api/bim.js — ruta de acceso al material comercial reservado.
//
// Esta ruta ES artefacto de una marca: `/bim` es la dirección que ESTE sitio publica, y
// como tal puede vivir aquí (MULTIBRAND_RULE §3, artefactos exclusivos de una marca). Lo
// que NO puede vivir aquí es el mecanismo — token, caducidad, revocación, registro de
// apertura y validación de marca—, que es eje del sistema y vive en `_collateral.js`.
// Otra marca monta ese módulo bajo la dirección que quiera, con su `BRAND_ID`.
//
// Todo lo que sigue corre en el SERVIDOR. La clave de servicio nunca llega al cliente:
// esta ruta responde HTML ya renderizado y no envía ni una línea de JavaScript propio.
//
// Contrato de respuesta:
//   token vigente y de esta marca  → 200, sirve el documento embebido y registra apertura
//   token vencido o revocado       → 410, página de vencimiento
//   token inexistente, malformado,
//   de otra marca, o ausente       → 404, página de acceso no disponible
//
// Verificable sin JS:
//   curl -sI https://<host>/bim/<token vigente>  → 200 + las cabeceras de privacidad
//   curl -s -o /dev/null -w '%{http_code}' https://<host>/bim  → 404

import { resolveChannel, derivedBaseUrl, ChannelError } from './_channel.js';
import { serveCollateral, applyPrivateHeaders, errorNotice } from './_collateral.js';

const PROVIDER = 'vercel_html';

// La identidad visual de las páginas de aviso sale del canal. Pero a diferencia del blog,
// aquí un canal irresoluble NO puede tumbar la ruta: el blog no sirve nada sin canal
// porque publicaría HTML indexable con datos inventados, y ese riesgo no existe aquí —
// este documento es privado, `noindex`, y su contenido no depende del canal en absoluto.
//
// Negarle a un destinatario legítimo un material vigente porque falta una fila de
// configuración del BLOG sería el fallo equivocado. Se degrada de forma declarada: se
// pierde el tema de marca en las dos páginas de aviso, no el acceso.
async function brandingConfig(req) {
  try {
    const { config } = await resolveChannel({ provider: PROVIDER, req });
    return config;
  } catch (e) {
    console.warn(`[bim] BRANDING_FALLBACK: las páginas de aviso salen sin tema de marca — ${e?.message ?? e}`);
    return { base_url: derivedBaseUrl(req) };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let config = null;
  try {
    config = await brandingConfig(req);

    // `/bim` sin token y `/bim/<lo que sea>` entran por la misma puerta. El módulo valida
    // la forma antes de tocar la base de datos, así que una ruta anidada o un token
    // recortado se resuelven sin consulta.
    const raw = req.query?.token;
    const token = Array.isArray(raw) ? raw[0] : raw;

    return await serveCollateral(req, res, { token: String(token ?? '').trim(), config });
  } catch (e) {
    // Un fallo de infraestructura —base de datos o almacenamiento caídos— NO se disfraza
    // de «acceso no disponible». Ese 404 le diría al destinatario que su enlace no sirve,
    // y volvería a pedir uno nuevo que tampoco iba a funcionar: el enlace está bien, lo
    // que falló es el sistema. Son dos mensajes distintos porque llevan a dos acciones
    // distintas, y confundirlos manda a la persona a hacer justo lo que no ayuda.
    const code = e instanceof ChannelError ? e.code : 'UNEXPECTED';
    const status = e instanceof ChannelError ? (e.status ?? 500) : 500;
    console.error(`[bim] ${code}: ${e?.detail ?? e?.message ?? e}`);

    applyPrivateHeaders(res);
    res.setHeader('X-Collateral-Error', code);
    return res.status(status >= 500 ? status : 500).send(errorNotice(config, code));
  }
}
