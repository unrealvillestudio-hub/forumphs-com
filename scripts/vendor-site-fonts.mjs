#!/usr/bin/env node
// scripts/vendor-site-fonts.mjs — interioriza las tipografías del sitio público (portada
// y blog) en `assets/site/`: `fonts.css` y `fonts/*.woff2`, la misma forma que
// `assets/collateral/` porque la reescritura de URLs es la misma.
//
// POR QUÉ EXISTE. Con las fuentes pedidas a Google en cada visita, el texto se dibuja
// primero con la tipografía del sistema y cambia al llegar la de la marca: en un teléfono
// con mala señal, o con un bloqueador que corta `fonts.googleapis.com`, el sitio se ve
// con Times o Arial y el wordmark deja de ser el wordmark. Servidas desde el propio
// dominio, llegan con la página, se precargan y se ven igual en cualquier navegador.
//
// La lógica de descarga y reescritura NO se repite aquí: es la de
// `scripts/vendor-collateral.mjs`, parametrizada con las familias y la carpeta del sitio.
//
// CÓMO SE CORRE:  node scripts/vendor-site-fonts.mjs

import { mkdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vendorFonts } from './vendor-collateral.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'site');
const FONT_DIR = join(OUT_DIR, 'fonts');

// Las cuatro voces del sistema de marca (BP_BRAND_ForumPHs → typography), con los pesos
// que el sitio usa de verdad, más las dos del crédito del estudio en el pie. Pedir un
// peso que no se carga hace que el navegador SINTETICE una negrita o una cursiva falsa.
const FAMILIES = [
  'EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500',   // display: titulares, cifras, «Forum»
  'Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400', // editorial: eyebrows, citas
  'Cinzel:wght@400;600',                                    // utility: etiquetas y tags
  'DM+Sans:wght@300;400;500;600;700',                       // body: texto, UI, «PHs», botones
  'Bebas+Neue',                                             // crédito del estudio (pie)
  'Space+Mono:wght@400',                                    // crédito del estudio (pie)
];

async function main() {
  await rm(FONT_DIR, { recursive: true, force: true });
  await mkdir(FONT_DIR, { recursive: true });
  console.log('Interiorizando tipografías del sitio en assets/site/');
  await vendorFonts({
    families: FAMILIES,
    outDir: OUT_DIR,
    fontDir: FONT_DIR,
    generator: 'scripts/vendor-site-fonts.mjs',
    purpose: 'Servido desde el propio dominio: el sitio se ve igual en cualquier navegador y no depende de un tercero.',
  });
}

main().catch((e) => {
  console.error(`\nFALLO: ${e.message}`);
  process.exit(1);
});
