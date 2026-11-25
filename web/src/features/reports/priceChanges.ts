// Discounts, price changes and refunds paid back a different way
// (report_price_changes, 0096/0104): rows and per-person totals.

import { roundCents } from '../../lib/money';

export type PriceChangeKind = 'price_change' | 'line_discount' | 'ticket_discount' | 'payment_type_change';

export interface PriceChangeRow {
  kind: PriceChangeKind;
  sold_at: string;
  sale_id: string;
  made_by: string;
  approved_by: string | null;
  item: string;
  /** Null on a refund paid back a different way, which takes nothing off. */
  qty: number | null;
  from_price: number | null;
  to_price: number | null;
  amount: number | null;
  reason: string;
}

export interface PersonTotals {
  person: string;
  price_changes: number;
  price_change_total: number;
  discounts: number;
  discount_total: number;
  approvals: number;
  approved_total: number;
  /** Refunds they paid back a different way than the sale was paid (0104). */
  payment_type_changes: number;
}

/** Each person's totals: changes they made at the register, and discounts they approved. */
export function totalsByPerson(rows: PriceChangeRow[]): PersonTotals[] {
  const people = new Map<string, PersonTotals>();
  const personFor = (person: string) => {
    let totals = people.get(person);
    if (!totals) {
      totals = { person, price_changes: 0, price_change_total: 0, discounts: 0, discount_total: 0, approvals: 0, approved_total: 0, payment_type_changes: 0 };
      people.set(person, totals);
    }
    return totals;
  };
  for (const row of rows) {
    const maker = personFor(row.made_by);
    const amount = Number(row.amount ?? 0);
    if (row.kind === 'payment_type_change') {
      maker.payment_type_changes += 1;
      continue;
    }
    if (row.kind === 'price_change') {
      maker.price_changes += 1;
      maker.price_change_total += amount;
    } else {
      maker.discounts += 1;
      maker.discount_total += amount;
    }
    if (row.approved_by) {
      const approver = personFor(row.approved_by);
      approver.approvals += 1;
      approver.approved_total += amount;
    }
  }
  return [...people.values()]
    .map((t) => ({
      ...t,
      price_change_total: roundCents(t.price_change_total),
      discount_total: roundCents(t.discount_total),
      approved_total: roundCents(t.approved_total),
    }))
    .sort((a, b) => a.person.localeCompare(b.person));
}
