#!/usr/bin/env node
// scripts/vendor-collateral.mjs — interioriza las dependencias de terceros que necesita
// el material comercial servido por `/bim`.
//
// POR QUÉ EXISTE. Un documento que se entrega bajo acuerdo de confidencialidad no puede
// pedirle recursos a un tercero mientras se lee: `fonts.gstatic.com` registra la IP de
// quien lo abre, y la Cláusula Sexta del acuerdo invoca finalidad y proporcionalidad.
// A eso se suman dos razones prácticas: un firewall corporativo puede bloquear esos
// dominios —y entonces la junta directiva ve el informe sin gráficas ni tipografías—, y
// un CDN ajeno puede cambiar de versión sin avisar.
//
// QUÉ PRODUCE, todo bajo `assets/collateral/`:
//   · `chart.umd.min.js`   — Chart.js, tomado del tarball oficial de npm
//   · `fonts.css`          — las @font-face con las URL reescritas a rutas locales
//   · `fonts/*.woff2`      — los archivos de tipografía
//
// CÓMO SE CORRE:  node scripts/vendor-collateral.mjs
//                 node scripts/vendor-collateral.mjs --chart 4.4.3
//
// Sin dependencias: este repo no tiene `package.json` y este script no introduce uno.
// El tarball de npm se lee con `zlib` y un lector de `tar` mínimo incluido abajo.

import { mkdir, writeFile, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'collateral');
const FONT_DIR = join(OUT_DIR, 'fonts');

// Navegador moderno: sin este User-Agent, Google Fonts devuelve `truetype` en vez de
// `woff2` y el peso se multiplica por cuatro.
const MODERN_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Subconjuntos que se conservan. El material se entrega en español e inglés; cirílico,
// griego y vietnamita añadirían peso que nadie va a leer. Es un recorte DECLARADO: si
// un documento necesitara otro alfabeto, se añade aquí y se vuelve a correr.
const KEEP_SUBSETS = new Set(['latin', 'latin-ext']);

// Familias que pide el material comercial. Los ejes y pesos siguen a los tokens de marca
// que ya viajan en `config.fonts_href` del canal, para que el documento y el sitio no se
// vean con dos tipografías distintas.
const FONT_FAMILIES = [
  'EB+Garamond:ital,wght@0,400;0,500;0,600;1,400',
  'Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400',
  'DM+Sans:wght@300;400;500;600;700',
];

// ── Lector de tar mínimo ────────────────────────────────────────────────────────────
// El formato es de bloques de 512 bytes: cabecera, datos rellenados al múltiplo, y dos
// bloques nulos al final. Sólo se necesita leer nombres y tamaños de archivos normales.

function untar(buf) {
  const files = new Map();
  for (let off = 0; off + 512 <= buf.length;) {
    const header = buf.subarray(off, off + 512);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) break; // bloque nulo: fin del archivo
    const sizeRaw = header.subarray(124, 136).toString('utf8').replace(/[\0 ]/g, '');
    const size = Number.parseInt(sizeRaw, 8) || 0;
    const typeFlag = String.fromCharCode(header[156]);
    off += 512;
    if (typeFlag === '0' || typeFlag === '\0') {
      files.set(name, buf.subarray(off, off + size));
    }
    off += Math.ceil(size / 512) * 512;
  }
  return files;
}

async function get(url, { asText = false, headers = {} } = {}) {
  const res = await fetch(url, { headers, redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return asText ? res.text() : Buffer.from(await res.arrayBuffer());
}

// ── 1 · Chart.js desde el tarball oficial de npm ────────────────────────────────────
// Se toma del registro, no de un CDN: el registro devuelve el paquete publicado y su
// versión exacta queda anotada en la cabecera del archivo generado.

async function vendorChart(requestedVersion) {
  const meta = JSON.parse(await get('https://registry.npmjs.org/chart.js', { asText: true }));
  const version = requestedVersion || meta['dist-tags'].latest;
  const spec = meta.versions[version];
  if (!spec) throw new Error(`chart.js@${version} no existe en el registro de npm`);

  const files = untar(gunzipSync(await get(spec.dist.tarball)));
  const entry = files.get('package/dist/chart.umd.js');
  if (!entry) throw new Error(`el tarball de chart.js@${version} no trae dist/chart.umd.js`);

  const banner = `/* Chart.js v${version} — MIT — interiorizado por scripts/vendor-collateral.mjs */\n`;
  await writeFile(join(OUT_DIR, 'chart.umd.min.js'), banner + entry.toString('utf8'));
  console.log(`  chart.umd.min.js       chart.js@${version}  (${entry.length} bytes)`);
  return version;
}

// ── 2 · Tipografías desde Google Fonts, reescritas a rutas locales ──────────────────
// La licencia SIL Open Font de estas familias permite el alojamiento propio; por eso
// interiorizarlas es legítimo y no sólo conveniente.

async function vendorFonts() {
  const href = `https://fonts.googleapis.com/css2?family=${FONT_FAMILIES.join('&family=')}&display=swap`;
  const css = await get(href, { asText: true, headers: { 'User-Agent': MODERN_UA } });

  // Cada @font-face viene precedido de un comentario con el nombre del subconjunto.
  const blocks = css.split('/*').slice(1);
  const kept = [];
  const downloads = new Map();

  for (const block of blocks) {
    const subset = block.slice(0, block.indexOf('*/')).trim();
    if (!KEEP_SUBSETS.has(subset)) continue;
    const face = block.slice(block.indexOf('*/') + 2).trim();
    if (!face.startsWith('@font-face')) continue;

    const rewritten = face.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g, (_m, url) => {
      const family = /font-family:\s*'([^']+)'/.exec(face)?.[1] ?? 'font';
      const weight = /font-weight:\s*(\d+)/.exec(face)?.[1] ?? '400';
      const italic = /font-style:\s*italic/.test(face);
      const name = `${family.toLowerCase().replace(/\s+/g, '-')}-${weight}${italic ? '-italic' : ''}-${subset}.woff2`;
      downloads.set(name, url);
      return `url(./fonts/${name})`;
    });
    kept.push(`/* ${subset} */\n${rewritten}`);
  }

  if (!kept.length) throw new Error('Google Fonts no devolvió ninguna @font-face de los subconjuntos pedidos');

  let bytes = 0;
  for (const [name, url] of downloads) {
    const buf = await get(url);
    await writeFile(join(FONT_DIR, name), buf);
    bytes += buf.length;
  }

  const header = [
    '/* Tipografías interiorizadas por scripts/vendor-collateral.mjs — NO editar a mano.',
    ' * Origen: fonts.googleapis.com · Licencia: SIL Open Font License 1.1 (permite alojamiento propio).',
    ` * Subconjuntos conservados: ${[...KEEP_SUBSETS].join(', ')}.`,
    ' * Servido desde el propio proyecto para que abrir el material no filtre la IP del lector.',
    ' */',
    '',
  ].join('\n');

  await writeFile(join(OUT_DIR, 'fonts.css'), header + kept.join('\n\n') + '\n');
  console.log(`  fonts.css              ${kept.length} @font-face`);
  console.log(`  fonts/*.woff2          ${downloads.size} archivos (${bytes} bytes)`);
}

// ── 3 · Reescritura de un documento ─────────────────────────────────────────────────
// Se exporta para que el paso de subir un HTML al bucket pueda apoyarse en la misma
// lógica en vez de reescribir las referencias a mano.

export function localizeDocument(html) {
  const changes = [];
  let out = html;

  out = out.replace(/<script\b[^>]*\bsrc=["'](https?:\/\/[^"']*\/chart[^"']*\.js)["'][^>]*>\s*<\/script>/gi, (m, url) => {
    changes.push(`chart.js: ${url}`);
    return '<script src="/assets/collateral/chart.umd.min.js"></script>';
  });

  out = out.replace(/<link\b[^>]*href=["']https:\/\/fonts\.googleapis\.com\/[^"']*["'][^>]*>/gi, (m) => {
    changes.push('google fonts stylesheet');
    return '<link rel="stylesheet" href="/assets/collateral/fonts.css">';
  });

  // Los `preconnect` a los dominios de Google sobran una vez interiorizadas las fuentes,
  // y dejarlos abriría la conexión que se quiere evitar.
  out = out.replace(/<link\b[^>]*rel=["'](?:preconnect|dns-prefetch)["'][^>]*href=["']https:\/\/fonts\.(?:googleapis|gstatic)\.com["'][^>]*>\s*/gi, () => {
    changes.push('preconnect a Google Fonts');
    return '';
  });

  // Un solo `preconnect` sobrante bastaría para filtrar la IP: se verifica que no quede
  // ninguna referencia viva antes de dar el documento por interiorizado.
  const leftovers = [...out.matchAll(/https?:\/\/(?:fonts\.(?:googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com)[^"'\s)]*/gi)].map((m) => m[0]);
  return { html: out, changes, leftovers };
}

// ── Entrada ─────────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const chartVersion = argv.includes('--chart') ? argv[argv.indexOf('--chart') + 1] : null;

  await rm(FONT_DIR, { recursive: true, force: true });
  await mkdir(FONT_DIR, { recursive: true });

  console.log('Interiorizando dependencias en assets/collateral/');
  const version = await vendorChart(chartVersion);
  await vendorFonts();
  console.log(`\nListo. Chart.js v${version}. Referencias locales: /assets/collateral/`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`\nFALLO: ${e.message}`);
    process.exit(1);
  });
}
