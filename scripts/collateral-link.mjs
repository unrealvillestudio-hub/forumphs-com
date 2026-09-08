#!/usr/bin/env node
// scripts/collateral-link.mjs — genera un token y arma el INSERT de un enlace nuevo.
//
// POR QUÉ EXISTE. El token tiene que valer 128 bits y medir 22 caracteres base62, y la
// tabla lo comprueba con una restricción. Un token escrito a mano falla el INSERT —o,
// peor, pasa y no se parece en nada a aleatorio. Este script usa el MISMO generador que
// la ruta, así que no hay dos definiciones de «token» que puedan divergir.
//
// NO TOCA LA BASE DE DATOS: imprime el SQL para que Sam lo revise y lo ejecute. Esa
// separación es deliberada — quien genera el enlace no es quien decide enviarlo.
//
// USO:
//   node scripts/collateral-link.mjs \
//     --brand ForumPHs \
//     --asset ForumPHs/suite-gestion-financiera.html \
//     --name "Nombre del destinatario" \
//     --email persona@ejemplo.com \
//     --note "Junta directiva, primera revisión" \
//     --days 30 \
//     --base https://forumphs.com

import { generateToken } from '../api/_collateral.js';

const ARGS = process.argv.slice(2);
const arg = (name, dflt = null) => {
  const i = ARGS.indexOf(`--${name}`);
  return i >= 0 && ARGS[i + 1] && !ARGS[i + 1].startsWith('--') ? ARGS[i + 1] : dflt;
};

// Un literal SQL se cita doblando la comilla simple. `null` se escribe sin comillas: un
// `'null'` entre comillas es la cadena «null», que no es lo mismo y no lo parece.
const lit = (v) => (v == null || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);

const brand = arg('brand');
const asset = arg('asset');
const days = Number.parseInt(arg('days', '30'), 10);

const missing = [];
if (!brand) missing.push('--brand (el brand_id, tal como está en public.brands.id)');
if (!asset) missing.push('--asset (la ruta dentro del bucket, p. ej. Marca/documento.html)');
if (!Number.isFinite(days) || days < 1) missing.push('--days (entero de días de vigencia, por defecto 30)');

if (missing.length) {
  console.error('Faltan datos obligatorios:\n  ' + missing.join('\n  '));
  console.error('\nSin ellos no se puede armar la fila. Ver la cabecera de este archivo para el uso completo.');
  process.exit(1);
}

if (!asset.startsWith(`${brand}/`)) {
  console.error(`AVISO: --asset '${asset}' no empieza por '${brand}/'.`);
  console.error('La convención del bucket es {brand_id}/{nombre}, y la ruta valida que el');
  console.error('brand_id de la fila coincida con el del sitio. Confirmar antes de ejecutar.\n');
}

const token = generateToken();
const base = (arg('base') || '').replace(/\/+$/, '');

const sql = `insert into public.collateral_links
  (token, brand_id, asset_path, recipient_name, recipient_email, note, expires_at, created_by)
values
  (${lit(token)}, ${lit(brand)}, ${lit(asset)}, ${lit(arg('name'))}, ${lit(arg('email'))}, ${lit(arg('note'))},
   now() + interval '${days} days', ${lit(arg('by', 'Sam'))});`;

console.log('\n-- Enlace nuevo · vigencia ' + days + ' días\n');
console.log(sql);
console.log('\nENLACE:  ' + (base ? `${base}/bim/${token}` : `https://<dominio>/bim/${token}`));
console.log('\nPara revocarlo antes de tiempo:');
console.log(`  update public.collateral_links set revoked_at = now() where token = ${lit(token)};\n`);
