// Moving a frame in and out of stock, and how its history reads (Phase 3B,
// 0067). The database refuses anything else; these mirror its rules.
import type { ProductUnitStatus, UnitStatusChange } from '../types/domain';

/** The database's limit on a reason. */
export const UNIT_REASON_MAX = 200;

export interface UnitMove {
  to: ProductUnitStatus;
  label: string;
}

const MOVES: Partial<Record<ProductUnitStatus, UnitMove[]>> = {
  in_stock: [
    { to: 'demo', label: 'Move to demo' },
    { to: 'retired', label: 'Retire' },
  ],
  demo: [
    { to: 'in_stock', label: 'Back in stock' },
    { to: 'retired', label: 'Retire' },
  ],
  retired: [{ to: 'in_stock', label: 'Back in stock' }],
};

/** What staff can do with a frame in this status (nothing once it's sold or assigned). */
export function unitMoves(status: ProductUnitStatus): UnitMove[] {
  return MOVES[status] ?? [];
}

/** What's wrong with a reason, or null. */
export function unitReasonProblem(reason: string): string | null {
  const text = reason.trim();
  if (!text) return 'Give a reason.';
  if (text.length > UNIT_REASON_MAX) return `Keep the reason to ${UNIT_REASON_MAX} characters.`;
  return null;
}

/**
 * "Received", "Sold", "Moved to demo", "Retired", "Back in stock", "Returned",
 * and for demo loans (0071) "Lent out", "Back from demo".
 */
export function unitChangeLabel(change: Pick<UnitStatusChange, 'from_status' | 'to_status' | 'refund_id'>): string {
  if (change.from_status === null) {
    return change.to_status === 'in_stock' ? 'Received' : `Recorded as ${statusText(change.to_status)}`;
  }
  if (change.refund_id) return change.to_status === 'retired' ? 'Returned damaged, retired' : 'Returned';
  if (change.to_status === 'assigned') return 'Lent out';
  if (change.from_status === 'assigned') return change.to_status === 'retired' ? 'Back from demo, retired' : 'Back from demo';
  switch (change.to_status) {
    case 'sold':
      return 'Sold';
    case 'demo':
      return 'Moved to demo';
    case 'retired':
      return 'Retired';
    default:
      // in_stock: every other move into stock (assigned is handled above).
      return 'Back in stock';
  }
}

/** A status as words: "in stock", "out on demo" for a frame lent out. */
export function statusText(status: ProductUnitStatus): string {
  return status === 'assigned' ? 'out on demo' : status.replace('_', ' ');
}

/** Why a scanned frame can't go on a ticket, or null if it can. */
export function unitUnavailableMessage(status: ProductUnitStatus): string | null {
  switch (status) {
    case 'in_stock':
      return null;
    case 'assigned':
      return 'That racket is out on demo: check it in on the Demos page first.';
    case 'demo':
      return 'That racket is in the demo fleet: put it back in stock on its product page to sell it.';
    default:
      return `That racket isn’t available to sell (it’s ${statusText(status)}).`;
  }
}
