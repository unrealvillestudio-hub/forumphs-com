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
//
// Un `#` o un `>` dentro de una frase es TEXTO: sólo cuentan al principio del bloque.
const HEADING = /^#{1,3}\s+(\S[\s\S]*)$/;
const QUOTE_LINE = /^>\s?/;

/**
 * Cuerpo → bloques `{ t: 'h' | 'quote' | 'p', text }`. El texto NO va escapado: el
 * renderizador escapa cada bloque antes de traducir la negrita.
 */
export function blocksOf(body) {
  return String(body || '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      const h = HEADING.exec(b);
      if (h) return { t: 'h', text: h[1].replace(/\s*\n\s*/g, ' ').replace(/\s+#+\s*$/, '').trim() };
      const lines = b.split('\n');
      if (lines.every((l) => QUOTE_LINE.test(l.trim()))) {
        return { t: 'quote', text: lines.map((l) => l.trim().replace(QUOTE_LINE, '')).join('\n').trim() };
      }
      return { t: 'p', text: b };
    })
    .filter((b) => b.text);
}

/** Quita todas las marcas del contrato. Para texto plano: extracto, meta description. */
export function stripMarks(text) {
  return stripEmphasis(String(text)
    .replace(/(^|\n)\s*#{1,3}\s+/g, '$1')
    .replace(/(^|\n)\s*>\s?/g, '$1'));
}
