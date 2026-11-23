import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
const {
  bySource,
  canRefundTo,
  exchangeCreditPayments,
  exchangeDifference,
  lineLabel,
  refundTotals,
  refundedLinesOf,
  saleCustomerInactive,
  saleRefundable,
} = await import('./saleForReturn');
type SaleData = import('./saleForReturn').SaleData;

const grip = {
  id: 'grip',
  product_id: 'p1',
  product_unit_id: null,
  string_job_id: null,
  gift_card_id: null,
  qty: 2,
  unit_price: 30,
  taxable: true,
  products: { brand: 'Wilson', name: 'Pro Overgrip', attributes: { color: 'White' } },
  string_jobs: null,
  gift_cards: null,
};

function saleWith(refunds: SaleData['refunds']): SaleData {
  return {
    id: 's1',
    tax: 4.95,
    tax_rate: 8.25,
    customer_id: null,
    customers: null,
    sale_lines: [grip],
    sale_payments: [{ method: 'credit', amount: 64.95, gift_card_id: null, gift_cards: null }],
    refunds,
  };
}

describe('refundTotals', () => {
  it('taxes a return at the sale’s rate', () => {
    expect(refundTotals(saleWith([]), { grip: 1 })).toEqual({ subtotal: 30, tax: 2.48, total: 32.48 });
  });

  it('gives back only the tax the sale has left', () => {
    const earlier = {
      subtotal: 30,
      tax: 2.48,
      refund_lines: [{ sale_line_id: 'grip', qty: 1, kind: 'return', unit_price: 30 }],
      refund_payments: [{ method: 'exchange' as never, amount: 32.48, gift_card_id: null }],
    };
    const sale = saleWith([earlier]);
    expect(refundedLinesOf(sale)).toHaveLength(1);
    expect(refundTotals(sale, { grip: 1 })).toEqual({ subtotal: 30, tax: 2.47, total: 32.47 });
  });

  it('is nothing without a sale', () => {
    expect(refundTotals(null, { grip: 1 })).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });
});

describe('exchangeDifference', () => {
  it('is what the customer owes, or (negative) what they get back', () => {
    expect(exchangeDifference(43.3, 32.47)).toBe(10.83);
    expect(exchangeDifference(21.65, 64.95)).toBe(-43.3);
    expect(exchangeDifference(32.48, 32.48)).toBe(0);
  });
});

describe('lineLabel and bySource', () => {
  it('names a product with its attributes', () => {
    expect(lineLabel(grip.products)).toBe('Wilson Pro Overgrip White');
    expect(lineLabel(null)).toBe('—');
  });

  it('keys a gift card payment by the card', () => {
    expect(bySource([{ method: 'gift_card', amount: 5, gift_card_id: 'gc1' }])).toEqual([{ method: 'gift_card:gc1', amount: 5 }]);
  });
});

describe('inactive customers and gift cards (0076)', () => {
  it('knows when the sale\'s customer is inactive', () => {
    const sale = (customers: SaleData['customers']) => ({ customers }) as SaleData;
    expect(saleCustomerInactive(sale({ first_name: 'Pat', last_name: 'Tester', is_active: false }))).toBe(true);
    expect(saleCustomerInactive(sale({ first_name: 'Pat', last_name: 'Tester', is_active: true }))).toBe(false);
    expect(saleCustomerInactive(sale(null))).toBe(false);
    expect(saleCustomerInactive(null)).toBe(false);
  });

  it('doesn\'t suggest refunding to an inactive gift card or an exchange credit', () => {
    const payment = { method: 'gift_card' as const, amount: 10, gift_card_id: 'gc1', gift_cards: { code: 'GC-1', is_active: true } };
    expect(canRefundTo(payment)).toBe(true);
    expect(canRefundTo({ ...payment, gift_cards: { code: 'GC-1', is_active: false } })).toBe(false);
    expect(canRefundTo({ method: 'exchange', amount: 10, gift_card_id: null, gift_cards: null })).toBe(false);
    expect(canRefundTo({ method: 'cash', amount: 10, gift_card_id: null, gift_cards: null })).toBe(true);
  });
});

describe('an exchange\'s credit on a later refund (0081)', () => {
  // As in the database's test 50: the original took $30 credit and $56.60
  // cash; the exchange moved $21.65 of it to the new sale, and a later refund
  // gave back $20 credit and $23.30 cash, so it has $10 credit and $33.30 cash left.
  const original = {
    sale_payments: [
      { method: 'credit' as const, amount: 30 },
      { method: 'cash' as const, amount: 56.6 },
    ],
    refunds: [
      { refund_payments: [{ method: 'exchange' as never, amount: 21.65 }] },
      { refund_payments: [{ method: 'credit' as const, amount: 20 }, { method: 'cash' as const, amount: 23.3 }] },
    ],
  };
  const newSale = {
    sale_payments: [
      { method: 'exchange' as const, amount: 21.65, gift_card_id: null, gift_cards: null },
      { method: 'cash' as const, amount: 10.83, gift_card_id: null, gift_cards: null },
    ],
    refunds: [],
    exchanges: { credit: 21.65, refunds: { sales: original } },
  } as unknown as SaleData;

  it('counts as the original\'s payment types, each up to the credit', () => {
    expect(exchangeCreditPayments(newSale).map((p) => [p.method, p.amount])).toEqual([
      ['credit', 10],
      ['cash', 21.65],
    ]);
  });

  it('adds to what the new sale can give back without a reason', () => {
    const refundable = saleRefundable(newSale);
    expect(refundable.get('cash')).toBe(3248);
    expect(refundable.get('credit')).toBe(1000);
    expect(refundable.get('exchange')).toBeUndefined();
  });

  it('is nothing for a sale no exchange paid for', () => {
    expect(exchangeCreditPayments({ ...newSale, exchanges: null })).toEqual([]);
    expect(exchangeCreditPayments({ ...newSale, exchanges: [] })).toEqual([]);
  });
});
