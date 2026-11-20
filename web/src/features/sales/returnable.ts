// Which sale lines can still be returned, and how many of each. Mirrors
// record_refund: only product lines (a racquet frame's line, one frame, since
// 0070), less what earlier refunds already returned.

export interface SaleLineForReturn {
  id: string;
  product_id: string | null;
  product_unit_id: string | null;
  qty: number;
}

export interface RefundedLine {
  sale_line_id: string;
  qty: number;
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
  for (const r of refundedLines) returned[r.sale_line_id] = (returned[r.sale_line_id] ?? 0) + r.qty;
  const remaining: Record<string, number> = {};
  for (const l of lines) {
    if (!l.product_id) continue;
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
  const count = refundedLines.reduce((sum, line) => sum + Number(line.qty), 0);
  return `${count} ${count === 1 ? 'item' : 'items'} returned`;
}

/** Whether any item is chosen to return. A $0 item counts: it still goes back in stock. */
export function hasItemsToReturn(returnQty: Record<string, number>): boolean {
  return Object.values(returnQty).some((q) => q > 0);
}
