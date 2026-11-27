// Counting a cash drawer by denomination: the bills and coins the shop keeps,
// what a count adds up to, and the count sent to the server. The server works
// the total out again from the same list (drawer_count_total, 0108).

import { hasSubCent, roundCents } from './money';

export interface Denomination {
  /** The key the server expects, e.g. "20" or "0.25". */
  key: string;
  label: string;
  value: number;
}

export const DENOMINATIONS: Denomination[] = [
  { key: '100', label: '$100', value: 100 },
  { key: '50', label: '$50', value: 50 },
  { key: '20', label: '$20', value: 20 },
  { key: '10', label: '$10', value: 10 },
  { key: '5', label: '$5', value: 5 },
  { key: '1', label: '$1', value: 1 },
  { key: '0.25', label: '25¢', value: 0.25 },
  { key: '0.10', label: '10¢', value: 0.1 },
  { key: '0.05', label: '5¢', value: 0.05 },
  { key: '0.01', label: '1¢', value: 0.01 },
];

/** The key for cash that isn't loose bills or coins (rolled coin and the like): an amount. */
export const OTHER_CASH_KEY = 'other';

/** What was typed: a count per denomination key, plus "other" (an amount). */
export type CountForm = Record<string, string>;

export function emptyCount(): CountForm {
  return Object.fromEntries([...DENOMINATIONS.map((d) => [d.key, '']), [OTHER_CASH_KEY, '']]);
}

const WHOLE_NUMBER = /^\d+$/;
const AMOUNT = /^\d+(\.\d+)?$/;

/** The count to send, or what's wrong with what was typed. Empty boxes count as none. */
export function parseCount(form: CountForm): { counts: Record<string, number>; total: number } | { error: string } {
  const counts: Record<string, number> = {};
  let total = 0;
  for (const denomination of DENOMINATIONS) {
    const text = (form[denomination.key] ?? '').trim();
    if (!text) continue;
    if (!WHOLE_NUMBER.test(text)) return { error: `${denomination.label}: enter how many, as a whole number.` };
    counts[denomination.key] = Number(text);
    total += denomination.value * Number(text);
  }
  const other = (form[OTHER_CASH_KEY] ?? '').trim();
  if (other) {
    if (!AMOUNT.test(other)) return { error: 'Other cash: enter an amount, like 10.00.' };
    if (hasSubCent(other)) return { error: 'Other cash: use at most 2 decimal places.' };
    counts[OTHER_CASH_KEY] = Number(other);
    total += Number(other);
  }
  return { counts, total: roundCents(total) };
}

/** Whether anything has been typed into the count yet. */
export function hasCountStarted(form: CountForm): boolean {
  return Object.values(form).some((text) => text.trim() !== '');
}

/** A count's total for display while typing; null while something typed isn't valid. */
export function countTotal(form: CountForm): number | null {
  const parsed = parseCount(form);
  return 'error' in parsed ? null : parsed.total;
}
