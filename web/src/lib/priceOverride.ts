// Price overrides at the register: a line sold at a price other than its list
// price (the catalog price, or the string job's price) needs a reason. The
// server (quote_sale, record_sale) applies the same rule and keeps both prices.
import { fromCents, toCents } from './saleMath';

/** The lookup list the quick-pick reasons come from. */
export const PRICE_REASON_LOOKUP_KIND = 'price_reason';

/** The price fields of a ticket line. */
export interface OverridableLine {
  label: string;
  /** Unit price as typed. */
  price: string | number;
  /**
   * The list price when the line was added. null: there's none to change from
   * (a gift card load, an item without a catalog price). undefined: not known
   * yet (a ticket held before list prices were kept); the next quote fills it.
   */
  listPrice?: number | null;
  priceReason?: string;
}

const dollars = (amount: number) => `$${fromCents(toCents(amount)).toFixed(2)}`;

/** The line's price differs from its list price. */
export function isPriceChanged(line: OverridableLine): boolean {
  if (line.listPrice == null) return false;
  return toCents(Number(line.price) || 0) !== toCents(line.listPrice);
}

/** The trimmed reason, or undefined when there's none. */
export function priceReasonOf(line: { priceReason?: string }): string | undefined {
  const reason = line.priceReason?.trim();
  return reason ? reason : undefined;
}

/** "Give a reason …" for each changed line without one, in ticket order. */
export function missingPriceReasons(lines: OverridableLine[]): string[] {
  return lines
    .filter((line) => isPriceChanged(line) && !priceReasonOf(line))
    .map((line) => `${line.label}: the price changed from ${dollars(line.listPrice ?? 0)}, so give a reason.`);
}

/**
 * Bring the ticket's list prices in line with the server's (quote_sale's
 * per-line list_price). A line whose price wasn't changed follows a catalog
 * price change; a changed line keeps its price and gets the new list price.
 * `notices` says which prices moved; `changed` is true when anything did.
 */
export function applyServerListPrices<T extends OverridableLine>(
  lines: T[],
  serverListPrices: (number | null)[],
): { lines: T[]; notices: string[]; changed: boolean } {
  const notices: string[] = [];
  let changed = false;
  const updated = lines.map((line, index) => {
    if (index >= serverListPrices.length) return line;
    const serverList = serverListPrices[index];
    const known = line.listPrice;
    if (known === undefined) {
      changed = true;
      return { ...line, listPrice: serverList };
    }
    const same = known === null || serverList === null ? known === serverList : toCents(known) === toCents(serverList);
    if (same) return line;
    changed = true;
    if (!isPriceChanged(line) && serverList !== null) {
      notices.push(`${line.label} is now ${dollars(serverList)} (it was ${dollars(known ?? 0)}).`);
      return { ...line, listPrice: serverList, price: fromCents(toCents(serverList)).toFixed(2) };
    }
    return { ...line, listPrice: serverList };
  });
  return { lines: updated, notices, changed };
}

/** "List $25.00 → $20.00 · Price match" for a saved line sold at a changed price, else null. */
export function priceChangeNote(
  listPrice: number | string | null,
  unitPrice: number | string,
  reason: string | null,
): string | null {
  if (listPrice == null || toCents(listPrice) === toCents(unitPrice)) return null;
  const change = `List ${dollars(Number(listPrice))} → ${dollars(Number(unitPrice))}`;
  return reason ? `${change} · ${reason}` : change;
}

/** record_sale refused a changed price with no reason (the list price moved after the quote). */
export function isPriceReasonError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('message' in error)) return false;
  return /^Price changed from .*give a reason/.test(String((error as { message: unknown }).message));
}
