// Verificación de maquetación de la portada en un navegador real (Chromium vía Playwright).
//
// POR QUÉ EXISTE. El 2026-09-30 la portada se cortaba a la derecha en el teléfono de Sam:
// su Chrome escala el texto (Accesibilidad), y una línea que no partía ensanchaba la
// columna de la grilla por encima de la pantalla. `overflow-x: hidden` en el body lo
// ocultaba: no había scroll lateral, sólo contenido recortado. Por eso esta prueba no
// mira `scrollWidth`, mira el borde derecho de CADA elemento.
//
// Escenarios: anchos de teléfono, texto ampliado al 130 % y al 150 % (sólo crece la letra,
// como el escalado de texto de Chrome Android) y pantallas de 240 y 280 px (lo que queda
// del ancho con el zoom predeterminado alto).
//
// CÓMO SE CORRE:  node scripts/verify-layout.mjs
// Requiere Playwright. Si no está instalado en el proyecto, apuntar al global:
//                 PLAYWRIGHT_MODULE="$(npm root -g)/playwright/index.mjs" node scripts/verify-layout.mjs

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.js': 'text/javascript' };

let pw;
try { pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright'); }
catch { console.error('Playwright no está disponible. Ver la cabecera de este archivo.'); process.exit(2); }
const chromium = pw.chromium ?? pw.default?.chromium;

// Servidor estático mínimo: sólo lo que la portada pide.
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/`;

// Elementos que pueden salirse a propósito: decorado recortado por su contenedor, capas
// fijas, la franja de credenciales (se desplaza en horizontal) y las escenas 3D, que
// recortan su propio contenido.
const IGNORE = '.creds-track,.atmos,.drawer,.action-bar,.wa-float,svg,.tower-stage,.net-stage,.cta-bg-text,.skip-link';

const SCENARIOS = [[375, 1], [390, 1], [360, 1.3], [360, 1.5], [320, 1.5], [280, 1], [240, 1], [768, 1], [1280, 1]];
const browser = await chromium.launch();
let fail = 0;
for (const [width, scale] of SCENARIOS) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: width < 900, hasTouch: width < 900 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  if (scale !== 1) {
    await page.evaluate((z) => {
      const els = [...document.querySelectorAll('body, body *')];
      const sizes = els.map((e) => parseFloat(getComputedStyle(e).fontSize));
      els.forEach((e, i) => { e.style.fontSize = `${sizes[i] * z}px`; });
    }, scale);
  }
  await page.waitForTimeout(200);
  const res = await page.evaluate((ignore) => {
    const cw = document.documentElement.clientWidth;
    const bad = [...document.querySelectorAll('body *')].filter((e) => {
      if (getComputedStyle(e).position === 'fixed' || e.closest(ignore)) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > cw + 1;
    });
    return bad.filter((e) => !bad.includes(e.parentElement)).slice(0, 5).map((e) => `${e.className || e.tagName}→${Math.round(e.getBoundingClientRect().right)}px`);
  }, IGNORE);
  const ok = res.length === 0 && errors.length === 0;
  if (!ok) fail++;
  console.log(`  ${ok ? '✔' : '✘'} ${width}px · texto ${Math.round(scale * 100)}% ${res.join(' | ')} ${errors.join(' ; ')}`);
  await ctx.close();
}
await browser.close();
server.close();
console.log(`\n═══ ${SCENARIOS.length - fail} pasaron · ${fail} fallaron ═══`);
process.exit(fail ? 1 : 0);
