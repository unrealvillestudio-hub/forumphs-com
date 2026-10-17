// Acuse de recibo para quien escribe por el formulario de la portada.
//
// Quien llena el formulario es, por definición, un prospecto, pero el acuse NO intenta
// adivinar qué busca: sólo confirma la recepción y el plazo. La respuesta con contenido
// (investigación, propuesta) la escribe una persona, desde `contacto@`, cuando ya se sabe
// el objetivo del contacto.
//
// Reglas del acuse (y por qué):
//   · Sale desde `no-reply@`, la dirección de TODOS los acuses (decisión de Sam, 2026-10-12),
//     que no se atiende. El canal de conversación es la
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

export const ACK_FROM = 'ForumPHs <no-reply@forumphs.com>';
export const OWN_DOMAIN = 'forumphs.com';

export const ACK_SUBJECT = 'Recibimos su consulta — ForumPHs';

export const ACK_TEXT = `Hola:

Gracias por contactarnos. Este es un mensaje automático que confirma la recepción de su consulta.

Nuestro equipo le responderá en aproximadamente 24 horas en días hábiles.

Esta dirección no recibe respuestas.

Saludos,
ForumPHs
Construiste tu patrimonio. Nosotros le construimos un sistema.
forumphs.com`;

// Logotype de correo: PNG, no texto. Excepción a la regla «sin PNG ni raster» aprobada por
// Sam el 2026-10-17 SÓLO para correo: los clientes de correo no cargan las tipografías de la
// marca, y una imagen es lo único que se ve igual en todos. Se genera desde el logotype v2
// (EB Garamond + DM Sans de assets/site/fonts) con el fondo Amatista Light ya horneado, para
// que el modo oscuro de un cliente no lo deje ilegible. Medidas fijas: no se agranda.
export const ACK_LOGOTYPE_URL = 'https://forumphs.com/assets/email/forumphs-logotype-light-on-am-l@3x.png';

// Cuerpo con la paleta `email_body` del BP (fondo #F8F5F2, texto ink) y firma de
// `email_signature_html`, en tablas. Los productos automatizados no nombran personas
// (BP_Brand_Context, 2026-09-30): la firma es la marca, no alguien.
export const ACK_HTML = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F8F5F2;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td style="padding:0 30px 24px;font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1A1612;">
  <p style="margin:0 0 14px;">Hola:</p>
  <p style="margin:0 0 14px;">Gracias por contactarnos. Este es un mensaje automático que confirma la recepción de su consulta.</p>
  <p style="margin:0 0 14px;">Nuestro equipo le responderá en <strong style="color:#5C3472;">aproximadamente 24 horas en días hábiles</strong>.</p>
  <p style="margin:0 0 14px;font-size:13px;color:#4A4440;">Esta dirección no recibe respuestas.</p>
  <p style="margin:0;">Saludos,</p>
</td></tr>
<tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-collapse:collapse;"><tr><td style="background:#EAD9F5;padding:20px 30px;border-top:1px solid #DCC9E8;"><img src="https://forumphs.com/assets/email/forumphs-logotype-light-on-am-l@3x.png" alt="ForumPHs" width="141" height="26" style="display:block;border:0;outline:none;width:141px;height:26px;font-family:'EB Garamond',Georgia,'Times New Roman',serif;font-size:20px;color:#5C3472;"></td></tr><tr><td style="background:#E4D6F0;padding:14px 30px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="font-family:'EB Garamond',Georgia,'Times New Roman',serif;font-size:9.5px;font-style:italic;color:#AE95BE;">Construiste tu patrimonio. Nosotros le construimos un sistema.</td><td align="right" style="font-family:'DM Sans',Helvetica,Arial,sans-serif;font-size:8.5px;letter-spacing:0.04em;color:#A99AB8;white-space:nowrap;">forumphs.com</td></tr></table></td></tr></table></td></tr>
</table>
</td></tr>
</table>
`;

// `true` si a esa dirección se le puede mandar el acuse.
export function ackAllowed(correo) {
  const domain = String(correo).split('@').pop().toLowerCase();
  return domain !== OWN_DOMAIN && !domain.endsWith(`.${OWN_DOMAIN}`);
}

// Cuerpo de la llamada a Resend. Recibe SÓLO el destinatario: no hay vía para que un campo
// del formulario entre al acuse. Sin `reply_to`: una respuesta llega a `no-reply@`, que no se atiende.
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
