// Typed money amounts. The server refuses any amount with a fraction of a cent
// (0046), so screens check what was typed before sending it.

/** The message shown when a typed amount has a fraction of a cent. */
export const SUB_CENT_MESSAGE = 'Use at most 2 decimal places';

/**
 * Whether a typed amount has a fraction of a cent, e.g. "3.334". Trailing
 * zeros ("10.500") are fine, as on the server; so is anything that isn't a
 * number, which each screen already handles.
 */
export function hasSubCent(text: string): boolean {
  const decimals = /\.(\d+)$/.exec(text.trim())?.[1] ?? '';
  return /[1-9]/.test(decimals.slice(2));
}

/**
 * A typed amount as a number, or null unless it's a plain amount: digits with
 * at most 2 decimal places ("12", "12.5", "12.50", ".50"). "1e3", "Infinity",
 * "-5" and "12.345" are refused.
 */
export function parsePlainAmount(text: string): number | null {
  const trimmed = text.trim();
  return /^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(trimmed) ? Number(trimmed) : null;
}

/** SUB_CENT_MESSAGE (with the field's name) if any amount has a fraction of a cent, else null. */
export function subCentError(amounts: Record<string, string>): string | null {
  for (const [label, text] of Object.entries(amounts)) {
    if (hasSubCent(text)) return `${label}: ${SUB_CENT_MESSAGE.toLowerCase()}.`;
  }
  return null;
}
