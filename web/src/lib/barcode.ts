// Pure helpers for barcode / UPC strings. Kept free of Supabase so they can be
// used anywhere (inputs, validation, the scan hooks).

/** Strip all whitespace — scanners and humans both sprinkle spaces into codes. */
export function normalizeBarcode(raw: string): string {
  return raw.replace(/\s+/g, '');
}

/**
 * An all-digits query (spaces allowed) is treated as a scanned code rather
 * than a free-text search term.
 */
export function looksLikeBarcode(query: string): boolean {
  return /^[0-9\s]+$/.test(query) && normalizeBarcode(query).length > 0;
}

/**
 * A single word with letters, e.g. a gift card code (GC-1234) or a racquet tag:
 * worth looking up as a code before treating it as a customer name. Anything
 * with a space is a name; an all-digits query is already a barcode.
 */
export function mightBeCode(query: string): boolean {
  const term = query.trim();
  return /^\S+$/.test(term) && !looksLikeBarcode(term);
}
