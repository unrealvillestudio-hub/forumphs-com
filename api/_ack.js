// Acuse de recibo para quien escribe por el formulario de la portada.
//
// Quien llena el formulario es, por definición, un prospecto, pero el acuse NO intenta
// adivinar qué busca: sólo confirma la recepción y el plazo. La respuesta con contenido
// (investigación, propuesta) la escribe una persona, desde `contacto@`, cuando ya se sabe
// el objetivo del contacto.
//
// Reglas del acuse (y por qué):
//   · Sale desde `noreply@`, que NO recibe respuestas. El canal de conversación es la
//     respuesta humana que llega después; responder al acuse no abre otra vía.
//   · NO repite nada de lo que escribió el visitante —ni nombre, ni propiedad, ni mensaje—.
//     El correo de destino lo escribe quien llena el formulario: si el acuse repitiera sus
//     campos, cualquiera podría usar el formulario para mandar el texto que quisiera, con
//     nuestro dominio y nuestra firma, a la dirección que quisiera.
//   · No sale hacia una dirección de forumphs.com: un bot que escribe `sales@forumphs.com`
//     no debe hacernos escribirnos a nosotros mismos.
//   · Sale DESPUÉS de que el aviso interno llegó bien, y su fallo no cambia lo que ve el
//     visitante: la consulta ya está en nuestro buzón, que es lo que importa.
//   · Sin teléfono ni WhatsApp: el prospecto entra por un canal y se queda en él, con su
//     traza (decisión de Sam, 2026-10-12).

export const ACK_FROM = 'ForumPHs <noreply@forumphs.com>';
export const OWN_DOMAIN = 'forumphs.com';

export const ACK_SUBJECT = 'Recibimos su consulta — ForumPHs';

export const ACK_TEXT = `Hola:

Gracias por contactarnos. Este es un mensaje automático que confirma la recepción de su consulta.

Nuestro equipo le responderá en aproximadamente 24 horas.

Esta dirección no recibe respuestas.

Saludos,
ForumPHs`;

export const ACK_HTML = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#222;line-height:1.5;">
  <p>Hola:</p>
  <p>Gracias por contactarnos. Este es un mensaje automático que confirma la recepción de su consulta.</p>
  <p>Nuestro equipo le responderá en <strong>aproximadamente 24 horas</strong>.</p>
  <p style="font-size:13px;color:#666;">Esta dirección no recibe respuestas.</p>
  <p style="margin-top:24px;">Saludos,<br><strong style="color:#5C3472;">ForumPHs</strong></p>
</div>
`;

// `true` si a esa dirección se le puede mandar el acuse.
export function ackAllowed(correo) {
  const domain = String(correo).split('@').pop().toLowerCase();
  return domain !== OWN_DOMAIN && !domain.endsWith(`.${OWN_DOMAIN}`);
}

// Cuerpo de la llamada a Resend. Recibe SÓLO el destinatario: no hay vía para que un campo
// del formulario entre al acuse. Sin `reply_to`: responder llega a `noreply@`, que no recibe.
export function ackPayload(correo) {
  return {
    from: ACK_FROM,
    to: [correo],
    subject: ACK_SUBJECT,
    text: ACK_TEXT,
    html: ACK_HTML,
    // Marca de respuesta automática: el respondedor del otro lado, si lo hay, no contesta.
    headers: { 'Auto-Submitted': 'auto-replied', 'X-Auto-Response-Suppress': 'All' },
  };
}
