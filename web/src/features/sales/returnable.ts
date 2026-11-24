// Which sale lines can still be returned, and how many of each. Mirrors
// record_refund: product lines (a racquet frame's line, one frame, since
// 0070), stringing charges (whole, since 0074) and gift card loads (whole,
// since 0075), less what earlier refunds already returned.
import { toCents } from '../../lib/saleMath';

export interface SaleLineForReturn {
  id: string;
  product_id: string | null;
  product_unit_id: string | null;
  qty: number;
  string_job_id?: string | null;
  gift_card_id?: string | null;
  unit_price?: number;
  taxable?: boolean;
  kind?: string;
  string_jobs?: { status: string; refund_id?: string | null } | null;
}

export interface RefundedLine {
  sale_line_id: string;
  qty: number;
  /** 'string_change' for a string-change give-back (0043); a return otherwise. */
  kind?: string;
  unit_price?: number;
}

/** A gift card load: refunded whole, with an admin's approval, while the card still holds it (0075). */
export function isGiftCardLoadLine(line: SaleLineForReturn): boolean {
  return line.gift_card_id != null;
}

/** Whether the card still holds the whole load (only an unused load is refunded). */
export function giftCardLoadUnused(line: SaleLineForReturn, cardBalance: number | undefined): boolean {
  return toCents(Number(cardBalance ?? 0)) >= line.qty * toCents(Number(line.unit_price ?? 0));
}

/** The gift card loads a return gives back, in cents: what an admin approves (0078). */
export function giftCardLoadRefundCents(lines: SaleLineForReturn[], returnQty: Record<string, number>): number {
  return lines
    .filter((l) => isGiftCardLoadLine(l) && (returnQty[l.id] ?? 0) > 0)
    .reduce((sum, l) => sum + (returnQty[l.id] ?? 0) * toCents(Number(l.unit_price ?? 0)), 0);
}

/** The gift card load lines a return gives back, sorted: the lines an admin approves (0083). */
export function giftCardLoadLineIds(lines: SaleLineForReturn[], returnQty: Record<string, number>): string[] {
  return lines
    .filter((l) => isGiftCardLoadLine(l) && (returnQty[l.id] ?? 0) > 0)
    .map((l) => l.id)
    .sort();
}

/** A stringing charge (a job's charge or a string-change charge): refunded whole. */
export function isStringingLine(line: SaleLineForReturn): boolean {
  return line.string_job_id != null;
}

/**
 * A string change's charge whose job's own charge isn't refunded yet: it
 * waits (0079), unless the job is delivered, when it comes back on its own (0084).
 */
export function waitsForJobCharge(line: SaleLineForReturn): boolean {
  return line.kind === 'string_change' && !line.string_jobs?.refund_id && line.string_jobs?.status !== 'delivered';
}

/** What refunding a stringing line does to its job (record_refund, 0074/0084). */
export function stringingLineNote(line: SaleLineForReturn): string {
  if (line.kind !== 'string_change') return stringingNote(line.string_jobs?.status);
  return waitsForJobCharge(line)
    ? 'a string change: refund the job’s own charge first, or deliver the job'
    : 'a string change: the job stays as it is';
}

/** What refunding a stringing charge does to its job, by the job's status (record_refund, 0074). */
export function stringingNote(jobStatus: string | undefined): string {
  switch (jobStatus) {
    case 'entered':
      return 'not strung yet: refunding cancels the job';
    case 'complete':
      return 'strung and waiting: deliver it before refunding';
    default:
      return 'the job stays on record, marked refunded';
  }
}

function isReturn(refunded: RefundedLine): boolean {
  return refunded.kind !== 'string_change';
}

function refundedCents(refunded: RefundedLine): number {
  return Number(refunded.qty) * toCents(Number(refunded.unit_price ?? 0));
}

/**
 * What one item of a line gives back, in cents: its price, or for a stringing
 * charge, its price less the string-change give-backs already made against it.
 */
export function refundPriceCents(line: SaleLineForReturn, refundedLines: RefundedLine[]): number {
  const priceCents = toCents(Number(line.unit_price ?? 0));
  if (!isStringingLine(line)) return priceCents;
  const givenBack = refundedLines
    .filter((r) => r.sale_line_id === line.id && !isReturn(r))
    .reduce((sum, r) => sum + refundedCents(r), 0);
  return Math.max(0, priceCents - givenBack);
}

/** The refund's subtotal and its taxed part, in cents, for the chosen quantities. */
export function refundSubtotals(
  lines: SaleLineForReturn[],
  refundedLines: RefundedLine[],
  returnQty: Record<string, number>,
): { subtotalCents: number; taxableCents: number } {
  let subtotalCents = 0;
  let taxableCents = 0;
  for (const line of lines) {
    const cents = (returnQty[line.id] ?? 0) * refundPriceCents(line, refundedLines);
    subtotalCents += cents;
    if (line.taxable !== false) taxableCents += cents;
  }
  return { subtotalCents, taxableCents };
}

/** What earlier refunds gave back on lines the sale taxed, in cents (as sale_refund_tax counts it). */
export function taxedRefundedCents(lines: SaleLineForReturn[], refundedLines: RefundedLine[]): number {
  const taxed = new Set(lines.filter((l) => l.taxable !== false).map((l) => l.id));
  return refundedLines.filter((r) => taxed.has(r.sale_line_id)).reduce((sum, r) => sum + refundedCents(r), 0);
}

/** A racquet frame's line: returned whole, saying what happens to the frame. */
export function isUnitLine(line: SaleLineForReturn): boolean {
  return line.product_unit_id != null;
}

/** What happens to a returned frame (0070). */
export interface FrameReturn {
  status: 'in_stock' | 'retired';
  reason: string;
}

export const DEFAULT_FRAME_RETURN: FrameReturn = { status: 'in_stock', reason: '' };

/** The database's limit on a returned frame's reason. */
const FRAME_REASON_MAX = 200;

/** What's missing from a returned frame's details, or null. */
export function frameReturnProblem(frame: FrameReturn): string | null {
  const reason = frame.reason.trim();
  if (frame.status === 'retired' && !reason) return 'Say why the returned frame is retired.';
  if (reason.length > FRAME_REASON_MAX) return `Keep the reason to ${FRAME_REASON_MAX} characters.`;
  return null;
}

/** The refund line sent for a returned frame. */
export function frameReturnLine(saleLineId: string, frame: FrameReturn) {
  return {
    sale_line_id: saleLineId,
    qty: 1,
    unit_status: frame.status,
    unit_reason: frame.reason.trim() || null,
  };
}

/** Quantity still returnable per returnable line id (lines that can't be returned are left out). */
export function returnableQty(lines: SaleLineForReturn[], refundedLines: RefundedLine[]): Record<string, number> {
  const returned: Record<string, number> = {};
  for (const r of refundedLines) {
    if (isReturn(r)) returned[r.sale_line_id] = (returned[r.sale_line_id] ?? 0) + r.qty;
  }
  const remaining: Record<string, number> = {};
  for (const l of lines) {
    if (isStringingLine(l)) {
      // Nothing is left once string changes have given the whole charge back.
      const sold = refundPriceCents(l, refundedLines) > 0 ? l.qty : 0;
      remaining[l.id] = Math.max(0, sold - (returned[l.id] ?? 0));
      continue;
    }
    if (!l.product_id && !isGiftCardLoadLine(l)) continue;
    remaining[l.id] = Math.max(0, l.qty - (returned[l.id] ?? 0));
  }
  return remaining;
}

/** Whether anything on the sale can still be returned. */
export function hasReturnable(lines: SaleLineForReturn[], refundedLines: RefundedLine[]): boolean {
  return Object.values(returnableQty(lines, refundedLines)).some((q) => q > 0);
}

/** "2 items returned", from a refund's returned lines. */
export function returnedItemsLabel(refundedLines: RefundedLine[]): string {
  const count = refundedLines.filter(isReturn).reduce((sum, line) => sum + Number(line.qty), 0);
  return `${count} ${count === 1 ? 'item' : 'items'} returned`;
}

/** Whether any item is chosen to return. A $0 item counts: it still goes back in stock. */
export function hasItemsToReturn(returnQty: Record<string, number>): boolean {
  return Object.values(returnQty).some((q) => q > 0);
}
