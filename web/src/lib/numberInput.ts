// Typed numbers, checked strictly so a typo ("52lb", "abc") is refused with a
// message naming the field, instead of being saved as empty (code review #30).

/** decimal: any number; whole: 3; halves: whole or half units, like 2 or 2.5 (stock). */
export type NumberKind = 'decimal' | 'whole' | 'halves';

const TYPED_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;

const EXAMPLE: Record<NumberKind, string> = {
  decimal: 'like 52 or 52.5',
  whole: 'like 3',
  halves: 'like 2 or 2.5',
};

/**
 * The number typed into a field (null when it's empty), or a message saying
 * what's wrong with it. Negative numbers are refused unless allowed.
 */
export function parseNumberField(
  text: string,
  label: string,
  kind: NumberKind = 'decimal',
  { allowNegative = false }: { allowNegative?: boolean } = {},
): { value: number | null } | { error: string } {
  const typed = text.trim();
  if (!typed) return { value: null };
  if (!TYPED_NUMBER.test(typed)) return { error: `${label}: enter a number, ${EXAMPLE[kind]}.` };
  const value = Number(typed);
  if (value < 0 && !allowNegative) return { error: `${label} can't be negative.` };
  if (kind === 'whole' && !Number.isInteger(value)) return { error: `${label}: enter a whole number, ${EXAMPLE.whole}.` };
  if (kind === 'halves' && !Number.isInteger(value * 2)) {
    return { error: `${label}: use whole or half units, ${EXAMPLE.halves}.` };
  }
  return { value };
}

/** The first problem among several fields, or null when every one is fine. */
export function firstNumberProblem(...results: ({ value: number | null } | { error: string })[]): string | null {
  for (const result of results) if ('error' in result) return result.error;
  return null;
}
