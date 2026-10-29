// Which sale lines can still be returned, and how many of each. Mirrors
// record_refund: only product lines, and not racquet units (returning a unit
// isn't supported yet), less what earlier refunds already returned.

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

/** A racquet unit's line: shown, but it can't be returned yet. */
export function isUnitLine(line: SaleLineForReturn): boolean {
  return line.product_unit_id != null;
}

/** Quantity still returnable per returnable line id (lines that can't be returned are left out). */
export function returnableQty(lines: SaleLineForReturn[], refundedLines: RefundedLine[]): Record<string, number> {
  const returned: Record<string, number> = {};
  for (const r of refundedLines) returned[r.sale_line_id] = (returned[r.sale_line_id] ?? 0) + r.qty;
  const remaining: Record<string, number> = {};
  for (const l of lines) {
    if (!l.product_id || isUnitLine(l)) continue;
    remaining[l.id] = Math.max(0, l.qty - (returned[l.id] ?? 0));
  }
  return remaining;
}

/** Whether anything on the sale can still be returned. */
export function hasReturnable(lines: SaleLineForReturn[], refundedLines: RefundedLine[]): boolean {
  return Object.values(returnableQty(lines, refundedLines)).some((q) => q > 0);
}
