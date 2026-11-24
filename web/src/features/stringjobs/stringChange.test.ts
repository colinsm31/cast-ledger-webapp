import { describe, expect, it } from 'vitest';
import { giveBackOverages, stringChangeChargesToRefund, stringChangeEvents, type JobSaleLineRow } from './stringChange';

describe('giveBackOverages', () => {
  const refundable = { cash: 13, credit: 0, store_credit: 10 };

  it('allows giving back up to what each payment type took', () => {
    expect(giveBackOverages([{ method: 'store_credit', amount: 10 }, { method: 'cash', amount: 13 }], refundable)).toEqual([]);
  });

  it('flags a payment type given back more than it took', () => {
    expect(giveBackOverages([{ method: 'cash', amount: 23 }], refundable)).toEqual(['cash']);
    expect(giveBackOverages([{ method: 'credit', amount: 5 }], refundable)).toEqual(['credit']);
  });

  it('adds up split amounts of the same type', () => {
    expect(giveBackOverages([{ method: 'cash', amount: 10 }, { method: 'cash', amount: 3.01 }], refundable)).toEqual(['cash']);
  });
});

describe('stringChangeEvents', () => {
  const staff = { email: 'staff@shop.test' };
  const rows: JobSaleLineRow[] = [
    {
      kind: 'charge',
      unit_price: 15,
      sales: { id: 'sale-a', sold_at: '2026-10-01T10:00:00Z', rung_by: staff },
      refund_lines: [
        {
          kind: 'string_change',
          unit_price: 10,
          refunds: { id: 'r1', sale_id: 'sale-a', refunded_at: '2026-10-03T10:00:00Z', refunded_by: staff },
        },
      ],
    },
    {
      kind: 'string_change',
      unit_price: 23,
      sales: { id: 'sale-b', sold_at: '2026-10-02T10:00:00Z', rung_by: staff },
      refund_lines: [],
    },
  ];

  it('lists string-change charges not refunded yet (0079)', () => {
    expect(stringChangeChargesToRefund(rows)).toEqual([{ saleId: 'sale-b', amount: 23 }]);
    const refunded = { ...rows[1], refund_lines: [{ kind: 'return' as const, unit_price: 23, refunds: null }] };
    expect(stringChangeChargesToRefund([rows[0], refunded])).toEqual([]);
  });

  it('lists what\'s left of a string change charge after give-backs, and not one fully given back', () => {
    const giveBack = (amount: number) => ({ kind: 'string_change' as const, unit_price: amount, refunds: null });
    expect(stringChangeChargesToRefund([{ ...rows[1], refund_lines: [giveBack(8)] }])).toEqual([{ saleId: 'sale-b', amount: 15 }]);
    expect(stringChangeChargesToRefund([{ ...rows[1], refund_lines: [giveBack(23)] }])).toEqual([]);
  });

  it('lists each charge and give-back with a link to its sale', () => {
    expect(stringChangeEvents(rows)).toEqual([
      { label: 'String change −$10.00', at: '2026-10-03T10:00:00Z', by: staff, href: '/sales/sale-a' },
      { label: 'String change +$23.00', at: '2026-10-02T10:00:00Z', by: staff, href: '/sales/sale-b' },
    ]);
  });

  it('leaves out the original charge (that is the "Paid" row)', () => {
    expect(stringChangeEvents([{ ...rows[0], refund_lines: [] }])).toEqual([]);
  });
});
