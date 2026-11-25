// Discounts and price changes (report_price_changes, 0096): rows and per-person totals.

export type PriceChangeKind = 'price_change' | 'line_discount' | 'ticket_discount';

export interface PriceChangeRow {
  kind: PriceChangeKind;
  sold_at: string;
  sale_id: string;
  made_by: string;
  approved_by: string | null;
  item: string;
  qty: number;
  from_price: number;
  to_price: number;
  amount: number;
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
}

/** Each person's totals: changes they made at the register, and discounts they approved. */
export function totalsByPerson(rows: PriceChangeRow[]): PersonTotals[] {
  const people = new Map<string, PersonTotals>();
  const personFor = (person: string) => {
    let totals = people.get(person);
    if (!totals) {
      totals = { person, price_changes: 0, price_change_total: 0, discounts: 0, discount_total: 0, approvals: 0, approved_total: 0 };
      people.set(person, totals);
    }
    return totals;
  };
  for (const row of rows) {
    const maker = personFor(row.made_by);
    const amount = Number(row.amount);
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
  const cents = (value: number) => Math.round(value * 100) / 100;
  return [...people.values()]
    .map((t) => ({ ...t, price_change_total: cents(t.price_change_total), discount_total: cents(t.discount_total), approved_total: cents(t.approved_total) }))
    .sort((a, b) => a.person.localeCompare(b.person));
}
