// Typed numbers, checked strictly so a typo ("52lb", "abc") is refused with a
// message naming the field, instead of being saved as empty (code review #30).

/** decimal: any number; whole: 3; halves: whole or half units, like 2 or 2.5 (stock). */
export type NumberKind = 'decimal' | 'whole' | 'halves';

const TYPED_NUMBER = /^-?(\d+(\.\d*)?|\.\d+)$/;

export const NumberLimits = {
  /** The largest amount the database stores (money columns are numeric(12,2)). */
  max: 9_999_999_999.99,
  /** String tensions are numeric(5,1). */
  maxTension: 9_999.9,
};

const EXAMPLE: Record<NumberKind, string> = {
  decimal: 'like 52 or 52.5',
  whole: 'like 3',
  halves: 'like 2 or 2.5',
};

/**
 * The number typed into a field (null when it's empty), or a message saying
 * what's wrong with it. Negative numbers are refused unless allowed, and
 * anything beyond `max` (by default the most the database stores) is refused
 * instead of failing with "numeric field overflow" (#13).
 */
export function parseNumberField(
  text: string,
  label: string,
  kind: NumberKind = 'decimal',
  { allowNegative = false, max = NumberLimits.max }: { allowNegative?: boolean; max?: number } = {},
): { value: number | null } | { error: string } {
  const typed = text.trim();
  if (!typed) return { value: null };
  if (!TYPED_NUMBER.test(typed)) return { error: `${label}: enter a number, ${EXAMPLE[kind]}.` };
  const value = Number(typed);
  if (value < 0 && !allowNegative) return { error: `${label} can't be negative.` };
  if (Math.abs(value) > max) return { error: `${label} is too large (the most is ${max.toLocaleString('en-US')}).` };
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

/**
 * A field's number for saving: null when it's empty or only spaces (never 0),
 * otherwise the number typed (#6). Check the field with parseNumberField first.
 */
export function optionalNumber(text: string): number | null {
  const typed = text.trim();
  return typed ? Number(typed) : null;
}
