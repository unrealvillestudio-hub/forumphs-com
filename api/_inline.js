// Marcado en línea que el generador escribe dentro del cuerpo de una pieza.
//
// Hoy es UNO: `**texto**`, la negrita. Es lo único que el generador usa y lo único que
// se traduce — el mismo criterio que ya aplica el publicador de blogs por API
// (`unrlvl-iid-functions/supabase/functions/blog-promoter`, función `negritas`), para
// que una pieza se vea igual en todos los blogs, sea cual sea su proveedor.
//
// Un conversor de markdown completo NO se usa a propósito: el cuerpo lo escribe un
// modelo y termina en el HTML de un sitio público. Se escapa todo primero y después se
// traduce sólo esta marca, sobre el texto ya inerte.
//
// Un asterisco suelto es TEXTO, no un error: sólo un par bien formado —que abre y cierra
// pegado a una palabra— es negrita. `5 * 3`, `nota*` o `**` a secas se publican tal cual.
const EMPHASIS = /\*\*(?!\s)([^*]+?)(?<!\s)\*\*/g;

/** `**texto**` → `<strong>texto</strong>`. Recibe texto YA escapado. */
export function emphasisToHtml(escaped) {
  return String(escaped).replace(EMPHASIS, '<strong>$1</strong>');
}

/** `**texto**` → `texto`. Para superficies de texto plano: extracto, meta description. */
export function stripEmphasis(text) {
  return String(text).replace(EMPHASIS, '$1');
}

// ── Bloques: el formato mínimo del contrato editorial (F1, Sam 2026-10-02) ──────────────
//
// Además de la negrita, el cuerpo de una pieza editorial puede traer DOS marcas de bloque,
// y sólo dos:
//   · `## Subtítulo` — un bloque que empieza con una a tres almohadillas y un espacio.
//   · `> Cita`       — un bloque cuyas líneas empiezan todas con `>`.
// Todo lo demás es párrafo. No hay listas, tablas, enlaces ni imágenes en el contrato: si el
// generador los escribiera, se publicarían como texto, que es lo que ya pasaba.
// (F2 añade una tercera marca de bloque, la de imagen interna: ver más abajo.)
//
// Un `#` o un `>` dentro de una frase es TEXTO: sólo cuentan al principio del bloque.
const HEADING = /^#{1,3}\s+(\S[\s\S]*)$/;
const QUOTE_LINE = /^>\s?/;

// ── Imagen dentro del artículo (F2, Sam 2026-10-02) ─────────────────────────────────────
//
// Una TERCERA marca de bloque: un bloque cuyo contenido completo es `![img-N]` reserva el
// sitio de la imagen N de la pieza. La imagen no viaja en el texto: vive en
// `assets.inline_images` —`{ n, url, alt, status, … }`— y el renderizador la cruza por `n`.
// La marca es interna y nunca se publica como texto: si la imagen no está lista, el bloque
// desaparece; en texto plano se quita siempre.
//
// `![img-N]` dentro de una frase, o con más texto en el mismo bloque, es TEXTO: igual que el
// `#` y el `>`, sólo cuenta como bloque completo. Un bloque `![img-N]` con N fuera de
// 1..INLINE_IMAGES_CONTRACT_MAX también es marca —y por eso nunca pinta ni se imprime—: el
// contrato prohíbe mostrar la marca, no sólo las que él mismo emite.
//
// Techo del contrato: EJE, no instancia. El tope de CADA canal es dato
// (`intel.brand_publish_channels.config.inline_images_max`) y lo aplica el productor; aquí
// sólo se acota lo que el contrato admite, para todas las marcas por igual.
export const INLINE_IMAGES_CONTRACT_MAX = 3;
const IMAGE_MARK = /^!\[img-(\d{1,3})\]$/;
const BLOCK_SEPARATOR = /\n\s*\n/;

/** Índice N si el bloque completo es una marca de imagen; si no, `null`. */
export function imageMarkOf(block) {
  const m = IMAGE_MARK.exec(String(block ?? '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * `assets.inline_images` → sólo las imágenes PINTABLES: `status === 'ok'`, `url` https y `n`
 * dentro del contrato. Lo demás —`planned`, `failed`, url ausente o no https, `n` fuera de
 * rango, entrada malformada— se descarta: su marca no pinta nada. Si dos entradas válidas
 * comparten `n`, gana la primera. `alt` es siempre string (vacío si falta). Salida
 * `{ n, status: 'ok', url, alt }`.
 */
export function inlineImagesOf(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object' || e.status !== 'ok') continue;
    const n = Number(e.n);
    if (!Number.isInteger(n) || n < 1 || n > INLINE_IMAGES_CONTRACT_MAX) continue;
    const url = typeof e.url === 'string' ? e.url.trim() : '';
    if (!url.startsWith('https://')) continue;
    if (out.some((x) => x.n === n)) continue;
    // `status` se conserva: la salida vuelve a pasar este filtro tal cual —el renderizador
    // filtra otra vez lo que recibe— y la función tiene que ser idempotente.
    const dims = inlineImageDims(e);
    out.push({ n, status: 'ok', url, alt: typeof e.alt === 'string' ? e.alt.trim() : '', ...(dims || {}) });
  }
  return out;
}

// ── Paquete de alt (Sam, 2026-10-03): ancho y alto reales de la imagen ──────────────────
//
// El productor guarda `width` y `height` de cada imagen dentro del artículo para que el
// navegador reserve su sitio antes de descargarla (sin saltos de diseño). Son DATO opcional:
// una imagen anterior al paquete no los trae y se pinta exactamente como antes. Sólo pasan
// los dos juntos, enteros, positivos y dentro de un tope de cordura; cualquier otra cosa se
// ignora entera —un alto sin ancho no reserva nada y sí deformaría la figura—.
export const INLINE_IMAGE_DIM_MAX = 20000;

/** `{ width, height }` si la entrada trae las dos medidas válidas; si no, `null`. */
export function inlineImageDims(e) {
  const w = Number(e && e.width), h = Number(e && e.height);
  const valida = (v) => Number.isInteger(v) && v > 0 && v <= INLINE_IMAGE_DIM_MAX;
  return valida(w) && valida(h) ? { width: w, height: h } : null;
}

/**
 * Cuerpo → bloques `{ t: 'h' | 'quote' | 'p', text }` o `{ t: 'img', n }`. El texto NO va
 * escapado: el renderizador escapa cada bloque antes de traducir la negrita.
 */
export function blocksOf(body) {
  return String(body || '')
    .split(BLOCK_SEPARATOR)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const n = imageMarkOf(b);
      if (n !== null) return { t: 'img', n };
      const h = HEADING.exec(b);
      if (h) return { t: 'h', text: h[1].replace(/\s*\n\s*/g, ' ').replace(/\s+#+\s*$/, '').trim() };
      const lines = b.split('\n');
      if (lines.every((l) => QUOTE_LINE.test(l.trim()))) {
        return { t: 'quote', text: lines.map((l) => l.trim().replace(QUOTE_LINE, '')).join('\n').trim() };
      }
      return { t: 'p', text: b };
    })
    .filter((b) => b.t === 'img' || b.text);
}

/**
 * Quita todas las marcas del contrato. Para texto plano: extracto, meta description. Una
 * marca de imagen se quita con su bloque entero —con o sin imagen detrás—: en texto plano
 * no hay dónde pintarla.
 */
export function stripMarks(text) {
  const sinImagenes = String(text)
    .split(BLOCK_SEPARATOR)
    .filter((b) => imageMarkOf(b) === null)
    .join('\n\n');
  return stripEmphasis(sinImagenes
    .replace(/(^|\n)\s*#{1,3}\s+/g, '$1')
    .replace(/(^|\n)\s*>\s?/g, '$1'));
}
