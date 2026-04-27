export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nombre, correo, telefono, propiedad, rol, mensaje } = req.body;

  if (!nombre || !correo) {
    return res.status(400).json({ error: 'Nombre y correo son requeridos' });
  }

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
        subject: `Consulta web — ${nombre}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#7C3AED;">Nueva consulta — forumphs.com</h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#666;width:140px;">Nombre</td><td style="padding:8px 0;font-weight:600;">${nombre}</td></tr>
              <tr><td style="padding:8px 0;color:#666;">Correo</td><td style="padding:8px 0;"><a href="mailto:${correo}">${correo}</a></td></tr>
              <tr><td style="padding:8px 0;color:#666;">Teléfono</td><td style="padding:8px 0;">${telefono || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#666;">Propiedad</td><td style="padding:8px 0;">${propiedad || '—'}</td></tr>
              <tr><td style="padding:8px 0;color:#666;">Rol</td><td style="padding:8px 0;">${rol || '—'}</td></tr>
            </table>
            <div style="margin-top:20px;padding:16px;background:#f5f5f5;border-left:4px solid #7C3AED;">
              <strong>Situación:</strong><br>
              <p style="margin:8px 0 0;">${mensaje || '—'}</p>
            </div>
            <p style="margin-top:24px;font-size:11px;color:#999;">Enviado desde forumphs.com · ${new Date().toLocaleString('es-PA', { timeZone: 'America/Panama' })}</p>
          </div>
        `
      })
    });

    if (response.ok) {
      return res.redirect(303, '/?enviado=1');
    } else {
      const err = await response.json();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Error al enviar. Intente de nuevo.' });
    }
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: 'Error de servidor.' });
  }
}
