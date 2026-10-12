import type { PaymentMethod } from '../../types/domain';
import { roundMoney } from '../../lib/saleMath';
import type { StaffRef } from '../../lib/staff';

/** What changing a paid job's strings would cost (the string_change_quote RPC). */
export interface StringChangeQuote {
  direction: 'none' | 'charge' | 'give_back';
  amount: number;
  tax: number;
  total: number;
  old_price: number;
  new_price: number;
  customer_id: string | null;
  // give_back only: what each payment type can give back without a reason.
  refundable?: Partial<Record<PaymentMethod, number>>;
}

/** Payment types a string change can be paid or given back with. */
export const STRING_CHANGE_METHODS: PaymentMethod[] = ['cash', 'credit', 'store_credit'];

/**
 * Payment types a give-back sends more to than the customer paid that way.
 * Each one is a payment-type change, which needs a reason.
 */
export function giveBackOverages(
  tenders: { method: PaymentMethod; amount: number }[],
  refundable: Partial<Record<PaymentMethod, number>>,
): PaymentMethod[] {
  const byMethod = new Map<PaymentMethod, number>();
  for (const t of tenders) byMethod.set(t.method, roundMoney((byMethod.get(t.method) ?? 0) + t.amount));
  return [...byMethod.entries()]
    .filter(([method, amount]) => amount > (refundable[method] ?? 0) + 0.005)
    .map(([method]) => method);
}

/** A string job's sale lines as the job page loads them, with any give-backs. */
export interface JobSaleLineRow {
  kind: 'charge' | 'string_change';
  unit_price: number;
  sales: { id: string; sold_at: string; rung_by: StaffRef | null } | null;
  refund_lines: {
    kind: 'return' | 'string_change';
    unit_price: number;
    refunds: { id: string; sale_id: string; refunded_at: string; refunded_by: StaffRef | null } | null;
  }[];
}

export interface StringChangeEvent {
  label: string;
  at: string;
  by: StaffRef | null;
  href: string;
}

/** History entries for string changes: "+$24.00" charged, "−$24.00" given back. */
export function stringChangeEvents(rows: JobSaleLineRow[]): StringChangeEvent[] {
  const events: StringChangeEvent[] = [];
  for (const row of rows) {
    if (row.kind === 'string_change' && row.sales) {
      events.push({
        label: `String change +$${Number(row.unit_price).toFixed(2)}`,
        at: row.sales.sold_at,
        by: row.sales.rung_by,
        href: `/sales/${row.sales.id}`,
      });
    }
    for (const refundLine of row.refund_lines ?? []) {
      if (refundLine.kind !== 'string_change' || !refundLine.refunds) continue;
      events.push({
        label: `String change −$${Number(refundLine.unit_price).toFixed(2)}`,
        at: refundLine.refunds.refunded_at,
        by: refundLine.refunds.refunded_by,
        href: `/sales/${refundLine.refunds.sale_id}`,
      });
    }
  }
  return events;
}
