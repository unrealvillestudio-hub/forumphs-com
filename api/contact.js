import { escapeHtml } from './_render.js';

// Topes de longitud por campo. El formulario es para una primera conversación: nada
// legítimo necesita más, y un tope evita que el endpoint reenvíe cuerpos arbitrarios.
const MAX_LEN = { nombre: 200, correo: 254, telefono: 40, propiedad: 200, rol: 40, mensaje: 5000 };

// Comprobación de forma, no de existencia: una sola arroba, algo a cada lado, un punto en
// el dominio y sin espacios ni caracteres que rompan un `mailto:` o una cabecera.
const EMAIL_RE = /^[^\s@<>"'()\\,;:]+@[^\s@<>"'()\\,;:]+\.[^\s@<>"'()\\,;:]+$/;

// Texto de un campo: siempre cadena, recortado y acotado a su tope.
function field(body, name) {
  const raw = body?.[name];
  const value = typeof raw === 'string' ? raw : (raw == null ? '' : String(raw));
  return value.trim().slice(0, MAX_LEN[name]);
}

// Valor ya escapado para el HTML del correo, o un guion si viene vacío.
function cell(value) {
  return value ? escapeHtml(value) : '—';
}

// Salida de error de un envío. El visitante vuelve a la portada con `?enviado=0` y ve un
// mensaje legible en la zona del formulario, nunca JSON crudo. El detalle se queda sólo en
// el log del servidor, con un código estable (`[contact] CONTACT_…`) para poder buscarlo:
// una redirección no deja rastro en ningún otro sitio.
//
// No se distingue por `Accept`: el camino de éxito nunca lo hizo (redirige siempre) y el
// único llamador del endpoint es el formulario nativo de la portada.
function failed(res, code, detail) {
  if (detail === undefined) console.error(`[contact] ${code}`);
  else console.error(`[contact] ${code}`, detail);
  return res.redirect(303, '/?enviado=0');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body ?? {};
  const nombre = field(body, 'nombre');
  const correo = field(body, 'correo');
  const telefono = field(body, 'telefono');
  const propiedad = field(body, 'propiedad');
  const rol = field(body, 'rol');
  const mensaje = field(body, 'mensaje');

  if (!nombre || !correo) {
    return failed(res, 'CONTACT_MISSING_FIELDS');
  }
  // El correo se usa en `reply_to` y en un `mailto:`: si no tiene forma de correo, no se envía.
  if (!EMAIL_RE.test(correo)) {
    return failed(res, 'CONTACT_BAD_EMAIL');
  }

  // Sin la clave no se llama a Resend con `Bearer undefined`: se falla aquí, con su código.
  if (!process.env.RESEND_API_KEY) {
    return failed(res, 'CONTACT_NO_API_KEY');
  }

  // El asunto es una cabecera: sin saltos de línea, aunque el nombre los traiga.
  const subjectName = nombre.replace(/[\r\n]+/g, ' ');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'ForumPHs Web <noreply@forumphs.com>',
        to: ['info@forumphs.com'],  // alias → forumphs507@gmail.com
        reply_to: correo,
        subject: `Consulta web — ${subjectName}`,
        // Todo lo que escribe el visitante entra ESCAPADO: el correo llega al buzón de la
        // empresa y no puede transportar HTML, enlaces ni imágenes de terceros.
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#5C3472;">Nueva consulta — forumphs.com</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#666;width:140px;">Nombre</td><td style="padding:8px 0;font-weight:600;">${cell(nombre)}</td></tr>
              <tr><td style="padding:8px 0;color:#666;">Correo</td><td style="padding:8px 0;"><a href="mailto:${escapeHtml(correo)}">${cell(correo)}</a></td></tr>
              <tr><td style="padding:8px 0;color:#666;">Teléfono</td><td style="padding:8px 0;">${cell(telefono)}</td></tr>
              <tr><td style="padding:8px 0;color:#666;">Propiedad</td><td style="padding:8px 0;">${cell(propiedad)}</td></tr>
              <tr><td style="padding:8px 0;color:#666;">Rol</td><td style="padding:8px 0;">${cell(rol)}</td></tr>
            </table>
            <div style="margin-top:20px;padding:16px;background:#f5f5f5;border-left:4px solid #5C3472;">
              <strong>Situación:</strong><br>
              <p style="margin:8px 0 0;">${cell(mensaje).replace(/\r?\n/g, '<br>')}</p>
            </div>
            <p style="margin-top:24px;font-size:11px;color:#999;">Enviado desde forumphs.com · ${new Date().toLocaleString('es-PA', { timeZone: 'America/Panama' })}</p>
          </div>
        `
      })
    });

    if (response.ok) {
      return res.redirect(303, '/?enviado=1');
    } else {
      const err = await response.json().catch(() => null);
      return failed(res, 'CONTACT_RESEND_ERROR', { status: response.status, err });
    }
  } catch (e) {
    return failed(res, 'CONTACT_HANDLER_ERROR', e);
  }
}
