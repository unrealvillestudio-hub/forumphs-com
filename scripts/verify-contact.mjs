// Verificación de api/contact.js. No envía correo: simula Resend interceptando `fetch`.
//
// CÓMO SE CORRE:  node scripts/verify-contact.mjs
// Para inyectarle la regresión (CC_PROTOCOL §14.2) se puede apuntar a otra versión del
// handler:        CONTACT_MODULE=/ruta/a/contact.js node scripts/verify-contact.mjs

import { pathToFileURL } from 'node:url';

const modulePath = process.env.CONTACT_MODULE
  ? pathToFileURL(process.env.CONTACT_MODULE).href
  : new URL('../api/contact.js', import.meta.url).href;
const handler = (await import(modulePath)).default;

process.env.RESEND_API_KEY = 'valor-simulado-no-es-un-secreto';

let sent = [];
let resendOk = true;
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), body: JSON.parse(init.body) });
  return resendOk
    ? { ok: true, json: async () => ({ id: 'simulado' }) }
    : { ok: false, json: async () => ({ message: 'fallo simulado' }) };
};
console.error = () => {};

function mockRes() {
  const r = { statusCode: 200, location: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.redirect = (c, l) => { r.statusCode = c; r.location = l; return r; };
  return r;
}
async function post(body, method = 'POST') {
  sent = [];
  const res = mockRes();
  await handler({ method, body }, res);
  return { res, mail: sent[0]?.body ?? null };
}

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✘ ${name} ${extra}`); }
}

const OK = { nombre: 'Ana Pérez', correo: 'ana@example.com', telefono: '+507 6000-0000', propiedad: 'PH Prueba', rol: 'presidente', mensaje: 'Primera línea\nSegunda línea' };

console.log('\n── 1 · Envío válido ──');
let { res, mail } = await post(OK);
check('303 a /?enviado=1 (la portada muestra la confirmación)', res.statusCode === 303 && res.location === '/?enviado=1', `${res.statusCode} ${res.location}`);
check('reply_to es el correo del visitante', mail?.reply_to === 'ana@example.com', mail?.reply_to);
check('el salto de línea del mensaje se muestra como <br>', mail?.html.includes('Primera línea<br>Segunda línea'));
check('sin el violeta fuera de marca', !/7C3AED/i.test(mail?.html ?? ''));
check('con Amatista de la paleta', mail?.html.includes('#5C3472'));

console.log('\n── 2 · Lo que escribe el visitante llega ESCAPADO ──');
({ res, mail } = await post({
  ...OK,
  nombre: '<img src=x onerror=alert(1)>',
  propiedad: '<a href="https://phishing.example">Pague aquí</a>',
  rol: '"><script>alert(1)</script>',
  telefono: '<b>555</b>',
  mensaje: '<img src="https://tracker.example/p.gif">\n<a href="https://x.example">clic</a>',
}));
const html = mail?.html ?? '';
check('nombre: la etiqueta no llega viva', !html.includes('<img src=x') && html.includes('&lt;img src=x onerror=alert(1)&gt;'));
check('propiedad: el enlace no llega vivo', !html.includes('<a href="https://phishing.example"') && html.includes('&lt;a href=&quot;https://phishing.example&quot;&gt;'));
check('rol: no cierra el atributo ni abre <script>', !html.includes('<script>') && html.includes('&lt;script&gt;'));
check('teléfono escapado', !html.includes('<b>555</b>') && html.includes('&lt;b&gt;555&lt;/b&gt;'));
check('mensaje: sin imagen de rastreo ni enlace vivos', !html.includes('<img src="https://tracker') && !html.includes('<a href="https://x.example"'));
check('el asunto no lleva HTML interpretado (es texto plano)', typeof mail?.subject === 'string');

console.log('\n── 3 · Correo inválido: 400 y no se envía nada ──');
for (const bad of ['sin-arroba', 'a@b', 'x" onmouseover="alert(1)@e.com', 'ana@example.com\nBcc: otro@example.com', 'javascript:alert(1)@x.com']) {
  ({ res, mail } = await post({ ...OK, correo: bad }));
  check(`«${bad.replace(/\n/g, '\\n')}» → 400 sin envío`, res.statusCode === 400 && mail === null, `${res.statusCode}`);
}

console.log('\n── 4 · Requeridos, método y cabeceras ──');
({ res, mail } = await post({ ...OK, nombre: '   ' }));
check('nombre vacío → 400 sin envío', res.statusCode === 400 && mail === null);
({ res, mail } = await post({ ...OK, correo: '' }));
check('correo vacío → 400 sin envío', res.statusCode === 400 && mail === null);
({ res } = await post(OK, 'GET'));
check('GET → 405', res.statusCode === 405);
({ res, mail } = await post({ ...OK, nombre: 'Ana\r\nBcc: otro@example.com' }));
check('el asunto no transporta saltos de línea', mail && !/[\r\n]/.test(mail.subject), JSON.stringify(mail?.subject));
({ res, mail } = await post({ ...OK, mensaje: 'x'.repeat(20000) }));
check('mensaje acotado a su tope', mail && (mail.html.match(/x+/g) || []).reduce((m, s) => Math.max(m, s.length), 0) <= 5000);
({ res, mail } = await post({ ...OK, nombre: ['a', 'b'] }));
check('un campo que no es cadena no tumba el handler', res.statusCode === 303, res.statusCode);

console.log('\n── 5 · Fallo de Resend ──');
resendOk = false;
({ res } = await post(OK));
check('Resend falla → 500 legible', res.statusCode === 500 && typeof res.body?.error === 'string', res.statusCode);
resendOk = true;

console.log(`\n═══ ${pass} pasaron · ${fail} fallaron ═══`);
process.exit(fail ? 1 : 0);
