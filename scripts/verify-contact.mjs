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
// Se captura lo que el handler deja en el log: en un fallo, el visitante sólo ve la
// redirección, y el log es la única vía para enterarse de qué pasó.
let logged = [];
console.error = (...args) => { logged.push(args.map(String).join(' ')); };

function mockRes() {
  const r = { statusCode: 200, location: null, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.redirect = (c, l) => { r.statusCode = c; r.location = l; return r; };
  return r;
}
async function post(body, method = 'POST') {
  sent = [];
  logged = [];
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

// Un fallo del envío NO devuelve JSON al visitante: 303 a /?enviado=0, donde la portada
// muestra un mensaje legible. El detalle va sólo al log, con un código estable.
const FAILED = (r) => r.statusCode === 303 && r.location === '/?enviado=0' && r.body === null;

console.log('\n── 3 · Correo inválido: 303 a /?enviado=0 y no se envía nada ──');
for (const bad of ['sin-arroba', 'a@b', 'x" onmouseover="alert(1)@e.com', 'ana@example.com\nBcc: otro@example.com', 'javascript:alert(1)@x.com']) {
  ({ res, mail } = await post({ ...OK, correo: bad }));
  check(`«${bad.replace(/\n/g, '\\n')}» → 303 /?enviado=0 sin envío`, FAILED(res) && mail === null, `${res.statusCode} ${res.location}`);
}
check('el log lleva el código CONTACT_BAD_EMAIL', logged.some((l) => l.includes('[contact] CONTACT_BAD_EMAIL')), JSON.stringify(logged));
check('el log no lleva el correo que escribió el visitante', !logged.some((l) => l.includes('javascript:alert')));

console.log('\n── 4 · Requeridos, método y cabeceras ──');
({ res, mail } = await post({ ...OK, nombre: '   ' }));
check('nombre vacío → 303 /?enviado=0 sin envío', FAILED(res) && mail === null, `${res.statusCode} ${res.location}`);
check('el log lleva el código CONTACT_MISSING_FIELDS', logged.some((l) => l.includes('[contact] CONTACT_MISSING_FIELDS')));
({ res, mail } = await post({ ...OK, correo: '' }));
check('correo vacío → 303 /?enviado=0 sin envío', FAILED(res) && mail === null, `${res.statusCode} ${res.location}`);
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
check('Resend falla → 303 /?enviado=0, sin JSON', FAILED(res), `${res.statusCode} ${res.location} ${JSON.stringify(res.body)}`);
check('el detalle de Resend queda en el log (CONTACT_RESEND_ERROR)', logged.some((l) => l.includes('[contact] CONTACT_RESEND_ERROR')), JSON.stringify(logged));
resendOk = true;

console.log('\n── 6 · Resend lanza (red caída) ──');
const realFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('red simulada caída'); };
({ res } = await post(OK));
check('excepción → 303 /?enviado=0, sin JSON', FAILED(res), `${res.statusCode} ${res.location}`);
check('el log lleva CONTACT_HANDLER_ERROR', logged.some((l) => l.includes('[contact] CONTACT_HANDLER_ERROR')));
globalThis.fetch = realFetch;

console.log('\n── 7 · Sin RESEND_API_KEY ──');
const savedKey = process.env.RESEND_API_KEY;
delete process.env.RESEND_API_KEY;
({ res, mail } = await post(OK));
check('sin clave → 303 /?enviado=0 y no se llama a Resend', FAILED(res) && mail === null, `${res.statusCode} ${res.location}`);
check('el log lleva CONTACT_NO_API_KEY', logged.some((l) => l.includes('[contact] CONTACT_NO_API_KEY')));
process.env.RESEND_API_KEY = savedKey;

console.log('\n── 8 · Defensa contra bots ──');
// Un bot recibe la MISMA confirmación que una persona (303 a /?enviado=1), pero no se
// envía ningún correo. El log lleva el motivo y nunca lo que escribió.
const SILENT = (r, m) => r.statusCode === 303 && r.location === '/?enviado=1' && m === null;
let bot;
bot = await post({ ...OK, sitio_web: 'https://spam.example' });
check('campo trampa relleno → confirmación sin envío', SILENT(bot.res, bot.mail), `${bot.res.statusCode} ${bot.res.location}`);
check('el log lleva CONTACT_BOT_HONEYPOT', logged.some((l) => l.includes('[contact] CONTACT_BOT_HONEYPOT')));
check('el log no lleva lo que escribió el bot', !logged.some((l) => l.includes('spam.example')));
bot = await post({ ...OK, form_ms: '800' });
check('enviado en menos de 3 s → confirmación sin envío', SILENT(bot.res, bot.mail));
check('el log lleva CONTACT_BOT_TOO_FAST', logged.some((l) => l.includes('[contact] CONTACT_BOT_TOO_FAST')));
bot = await post({ ...OK, form_ms: 'abc' });
check('tiempo que no es un entero → confirmación sin envío', SILENT(bot.res, bot.mail));
check('el log lleva CONTACT_BOT_BAD_TIMER', logged.some((l) => l.includes('[contact] CONTACT_BOT_BAD_TIMER')));
bot = await post({ ...OK, form_ms: String(2 * 24 * 60 * 60 * 1000) });
check('formulario abierto hace más de 24 h → confirmación sin envío', SILENT(bot.res, bot.mail));
bot = await post({ ...OK, sitio_web: '', form_ms: '45000' });
check('persona (trampa vacía, 45 s) → se envía', bot.res.location === '/?enviado=1' && bot.mail !== null);
bot = await post({ ...OK, sitio_web: '   ' });
check('trampa con sólo espacios cuenta como vacía → se envía', bot.mail !== null);
bot = await post(OK);
check('sin form_ms (navegador sin JavaScript) → se envía', bot.mail !== null);
bot = await post({ ...OK, correo: 'sin-arroba', sitio_web: 'x' });
check('bot con correo inválido: no se le dice qué falló', SILENT(bot.res, bot.mail));

console.log(`\n═══ ${pass} pasaron · ${fail} fallaron ═══`);
process.exit(fail ? 1 : 0);
