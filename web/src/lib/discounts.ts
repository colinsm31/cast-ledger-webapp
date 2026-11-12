// Discounts at the register. One number per line, or for the whole ticket:
//   1        100% off
//   below 1  that fraction off (0.25 = 25% off)
//   above 1  that many dollars off each item (3 = $3 off)
// Mirrors discount_each and sale_totals (0056) in whole cents, so the total
// the register shows is the total the server quotes.
import { fromCents, toCents } from './saleMath';

/** The lookup list the quick-pick reasons come from. */
export const DISCOUNT_REASON_LOOKUP_KIND = 'discount_reason';

const PLAIN_NUMBER = /^\d*\.?\d+$|^\d+\.$/;
/** The database keeps an entered discount to 4 decimal places (numeric(12,4)). */
const MAX_FRACTION_DECIMALS = 4;

export type ParsedDiscount = { discount: number | null } | { error: string };

function decimalsOf(text: string): number {
  return /\.(\d*?)0*$/.exec(text)?.[1].length ?? 0;
}

/** The discount typed in a box: null when blank or 0, or why it can't be used. */
export function parseDiscount(text: string | undefined): ParsedDiscount {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return { discount: null };
  if (!PLAIN_NUMBER.test(trimmed)) {
    return { error: 'enter a number: 0.25 for 25% off, 3 for $3 off, 1 for 100% off' };
  }
  const value = Number(trimmed);
  if (value === 0) return { discount: null };
  if (value > 1 && decimalsOf(trimmed) > 2) return { error: 'a dollar discount must be in whole cents' };
  if (value < 1 && decimalsOf(trimmed) > MAX_FRACTION_DECIMALS) {
    return { error: 'a percent discount can have at most 4 decimal places (0.1234 = 12.34%)' };
  }
  return { discount: value };
}

/** The parsed discount, or null when blank or not valid. */
export function discountValue(text: string | undefined): number | null {
  const parsed = parseDiscount(text);
  return 'discount' in parsed ? parsed.discount : null;
}

function trimPercent(fraction: number): string {
  return String(Number((fraction * 100).toFixed(2)));
}

/** "25% off", "$3.00 off each", "100% off"; `scope` replaces "each" for the ticket. */
export function describeDiscount(discount: number, scope = 'each'): string {
  if (discount > 1) return `$${discount.toFixed(2)} off ${scope}`;
  return `${trimPercent(discount)}% off`;
}

/** Tenths of a thousandth: the fraction as an exact integer (0.25 → 2500). */
function fractionUnits(discount: number): number {
  return Math.round(discount * 10_000);
}

/**
 * What one discount takes off one item, in cents (discount_each). Throws the
 * server's message when a dollar discount is more than the price.
 */
export function discountEachCents(priceCents: number, discount: number | null): number {
  if (discount == null || discount === 0) return 0;
  if (discount === 1) return priceCents;
  if (discount < 1) return Math.floor((priceCents * fractionUnits(discount) + 5_000) / 10_000);
  const discountCents = toCents(discount);
  if (discountCents > priceCents) {
    throw new Error(
      `A $${discount.toFixed(2)} discount is more than the $${fromCents(priceCents).toFixed(2)} price`,
    );
  }
  return discountCents;
}

/** A ticket line as discounts see it. */
export interface DiscountableLine {
  qty: number;
  /** Unit price as typed (the price before discounts). */
  price: string | number;
  giftCardId?: string;
  /** The line's discount box, as typed. */
  discount?: string;
}

export interface DiscountedLine {
  /** Each item's price after discounts, as a dollar string ready to total. */
  price: string;
  lineDiscountEachCents: number;
  ticketDiscountEachCents: number;
}

export interface DiscountedTicket {
  lines: DiscountedLine[];
  /** Everything the discounts take off, in cents. */
  discountCents: number;
  /** Why the discounts can't be applied (e.g. more off than the price), or null. */
  error: string | null;
}

/**
 * Apply line discounts, then the ticket discount, to each line (sale_totals).
 * A dollar ticket discount is shared out in proportion to what each eligible
 * item costs after its line discount, each share rounded to the cent. Gift
 * card loads are never discounted. Invalid boxes count as no discount; the
 * register refuses them before payment.
 */
export function applyDiscounts(lines: DiscountableLine[], ticketDiscountText?: string): DiscountedTicket {
  const ticket = discountValue(ticketDiscountText);
  const undiscounted = (): DiscountedTicket => ({
    lines: lines.map((line) => ({
      price: fromCents(toCents(line.price)).toFixed(2),
      lineDiscountEachCents: 0,
      ticketDiscountEachCents: 0,
    })),
    discountCents: 0,
    error: null,
  });
  try {
    const lineEach = lines.map((line) =>
      line.giftCardId ? 0 : discountEachCents(toCents(line.price), discountValue(line.discount)),
    );
    const afterLineCents = lines.reduce(
      (sum, line, index) => (line.giftCardId ? sum : sum + line.qty * (toCents(line.price) - lineEach[index])),
      0,
    );
    const ticketCents = ticket != null && ticket > 1 ? toCents(ticket) : null;
    if (ticketCents != null && ticketCents > afterLineCents) {
      throw new Error(
        `A $${ticket!.toFixed(2)} ticket discount is more than the $${fromCents(afterLineCents).toFixed(2)} of items it applies to`,
      );
    }
    let discountCents = 0;
    const discounted = lines.map((line, index) => {
      const priceCents = toCents(line.price);
      const remaining = priceCents - lineEach[index];
      let ticketEach = 0;
      if (!line.giftCardId && ticket != null) {
        // round(remaining × ticket / afterLine, 2), half up, in exact integers.
        ticketEach =
          ticketCents != null
            ? Math.floor((2 * remaining * ticketCents + afterLineCents) / (2 * afterLineCents))
            : discountEachCents(remaining, ticket);
      }
      discountCents += line.qty * (lineEach[index] + ticketEach);
      return {
        price: fromCents(priceCents - lineEach[index] - ticketEach).toFixed(2),
        lineDiscountEachCents: lineEach[index],
        ticketDiscountEachCents: ticketEach,
      };
    });
    return { lines: discounted, discountCents, error: null };
  } catch (err) {
    return { ...undiscounted(), error: err instanceof Error ? err.message : String(err) };
  }
}

/** The trimmed reason, or undefined when there's none. */
export function discountReasonOf(line: { discountReason?: string }): string | undefined {
  const reason = line.discountReason?.trim();
  return reason ? reason : undefined;
}

/** What's wrong with the ticket's discount boxes, one message each, in ticket order. */
export function discountProblems(
  lines: (DiscountableLine & { label: string; discountReason?: string })[],
  ticket: { discount?: string; discountReason?: string },
): string[] {
  const problems: string[] = [];
  for (const line of lines) {
    const parsed = parseDiscount(line.discount);
    if ('error' in parsed) problems.push(`${line.label}: discount: ${parsed.error}.`);
    else if (parsed.discount != null && line.giftCardId) problems.push(`${line.label}: a gift card sale can't be discounted.`);
    else if (parsed.discount != null && !discountReasonOf(line)) {
      problems.push(`${line.label}: give a reason for the discount.`);
    }
  }
  const parsedTicket = parseDiscount(ticket.discount);
  if ('error' in parsedTicket) problems.push(`Ticket discount: ${parsedTicket.error}.`);
  else if (parsedTicket.discount != null && !discountReasonOf(ticket)) {
    problems.push('Ticket discount: give a reason.');
  }
  const applied = applyDiscounts(lines, ticket.discount);
  if (applied.error) problems.push(`${applied.error}.`);
  return problems;
}

/** A whole-ticket quote problem that an admin's approval would clear. */
export function isApprovalProblem(problem: { line: number | null; message: string }): boolean {
  return (
    problem.line === null &&
    (/an admin must approve it$/.test(problem.message) || /admin approval doesn't cover/.test(problem.message))
  );
}

/** A saved sale line's discount fields (sale_lines, 0056). */
export interface SavedDiscountLine {
  unit_price: number | string;
  price_before_discount: number | string | null;
  line_discount: number | string | null;
  ticket_discount_each: number | string | null;
  discount_reason: string | null;
}

/** Everything a saved sale's discounts took off, in cents. */
export function savedDiscountCents(lines: (SavedDiscountLine & { qty: number })[]): number {
  return lines.reduce(
    (sum, line) =>
      line.price_before_discount == null
        ? sum
        : sum + line.qty * (toCents(line.price_before_discount) - toCents(line.unit_price)),
    0,
  );
}

/** "10% off · Loyalty" or "$5.00 off the ticket · Loyalty" for a saved ticket discount, else null. */
export function savedTicketDiscountNote(discount: number | string | null, reason: string | null): string | null {
  if (discount == null || Number(discount) === 0) return null;
  return [describeDiscount(Number(discount), 'the ticket'), reason].filter(Boolean).join(' · ');
}

/** "$20.00 → $16.50 · 10% off · Promotion + ticket discount" for a discounted saved line, else null. */
export function savedDiscountNote(line: SavedDiscountLine): string | null {
  if (line.price_before_discount == null || toCents(line.price_before_discount) === toCents(line.unit_price)) {
    return null;
  }
  const parts: string[] = [];
  if (line.line_discount != null && Number(line.line_discount) !== 0) {
    parts.push([describeDiscount(Number(line.line_discount)), line.discount_reason].filter(Boolean).join(' · '));
  }
  if (line.ticket_discount_each != null && toCents(line.ticket_discount_each) > 0) parts.push('ticket discount');
  const change = `$${fromCents(toCents(line.price_before_discount)).toFixed(2)} → $${fromCents(toCents(line.unit_price)).toFixed(2)}`;
  return [change, parts.join(' + ')].filter(Boolean).join(' · ');
}
