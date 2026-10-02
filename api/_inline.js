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
