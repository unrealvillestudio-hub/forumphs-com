// Acuse de recibo para quien escribe por el formulario de la portada.
//
// Quien llena el formulario es, por definición, un prospecto: el formulario existe para pedir
// una propuesta de administración. Por eso este acuse no necesita clasificar nada.
//
// Reglas del acuse (y por qué):
//   · NO repite nada de lo que escribió el visitante —ni nombre, ni propiedad, ni mensaje—.
//     El correo de destino lo escribe quien llena el formulario: si el acuse repitiera sus
//     campos, cualquiera podría usar el formulario para mandar el texto que quisiera, con
//     nuestro dominio y nuestra firma, a la dirección que quisiera.
//   · No sale hacia una dirección de forumphs.com: un bot que escribe `sales@forumphs.com`
//     no debe hacernos escribirnos a nosotros mismos.
//   · Sale DESPUÉS de que el aviso interno llegó bien, y su fallo no cambia lo que ve el
//     visitante: la consulta ya está en nuestro buzón, que es lo que importa.
//   · Sale desde `contacto@`, el canal de ventas: si el prospecto responde, su respuesta
//     llega al mismo hilo que después contestamos.

export const ACK_FROM = 'ForumPHs <contacto@forumphs.com>';
export const ACK_REPLY_TO = 'contacto@forumphs.com';
export const OWN_DOMAIN = 'forumphs.com';
const WHATSAPP_DISPLAY = '+507 6722-7355';
const WHATSAPP_LINK = 'https://wa.me/50767227355';

export const ACK_SUBJECT = 'Recibimos su consulta — ForumPHs';

export const ACK_TEXT = `Gracias por escribirnos.

Recibimos su consulta y ya la tiene nuestro equipo. Le respondemos en menos de un día hábil, desde esta misma dirección.

Así trabajamos cada solicitud:
1. Revisamos la información pública de su PH.
2. Preparamos una primera lectura de su situación.
3. Se la enviamos junto con unas pocas preguntas de respuesta rápida, para proponerle un plan a la medida de su PH.

Si su caso es urgente, puede escribirnos por WhatsApp al ${WHATSAPP_DISPLAY}.

Atentamente,
ForumPHs
Administración de Propiedades Horizontales
https://forumphs.com

Este mensaje es automático. Si lo responde, su respuesta llega a nuestro equipo.`;

export const ACK_HTML = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;line-height:1.5;">
  <p>Gracias por escribirnos.</p>
  <p>Recibimos su consulta y ya la tiene nuestro equipo. Le respondemos en <strong>menos de un día hábil</strong>, desde esta misma dirección.</p>
  <p style="margin-bottom:4px;">Así trabajamos cada solicitud:</p>
  <ol style="margin-top:0;padding-left:20px;">
    <li>Revisamos la información pública de su PH.</li>
    <li>Preparamos una primera lectura de su situación.</li>
    <li>Se la enviamos junto con unas pocas preguntas de respuesta rápida, para proponerle un plan a la medida de su PH.</li>
  </ol>
  <p>Si su caso es urgente, puede escribirnos por WhatsApp al <a href="${WHATSAPP_LINK}" style="color:#5C3472;">${WHATSAPP_DISPLAY}</a>.</p>
  <p style="margin-top:24px;">Atentamente,<br><strong style="color:#5C3472;">ForumPHs</strong><br>Administración de Propiedades Horizontales<br><a href="https://forumphs.com" style="color:#5C3472;">forumphs.com</a></p>
  <p style="margin-top:24px;font-size:11px;color:#999;">Este mensaje es automático. Si lo responde, su respuesta llega a nuestro equipo.</p>
</div>
`;

// `true` si a esa dirección se le puede mandar el acuse.
export function ackAllowed(correo) {
  const domain = String(correo).split('@').pop().toLowerCase();
  return domain !== OWN_DOMAIN && !domain.endsWith(`.${OWN_DOMAIN}`);
}

// Cuerpo de la llamada a Resend. Recibe SÓLO el destinatario: no hay vía para que un campo
// del formulario entre al acuse.
export function ackPayload(correo) {
  return {
    from: ACK_FROM,
    to: [correo],
    reply_to: ACK_REPLY_TO,
    subject: ACK_SUBJECT,
    text: ACK_TEXT,
    html: ACK_HTML,
    // Marca de respuesta automática: el respondedor del otro lado, si lo hay, no contesta.
    headers: { 'Auto-Submitted': 'auto-replied', 'X-Auto-Response-Suppress': 'All' },
  };
}
