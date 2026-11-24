import { describe, expect, it, vi } from 'vitest';

const from = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { from: (...args: unknown[]) => from(...args) } }));
const {
  bySource,
  canRefundTo,
  exchangeDifference,
  lineLabel,
  loadSaleForReturn,
  moneyPaymentsOf,
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

describe('an exchange\'s credit on a later refund (0082)', () => {
  // As in the database's test 50: the new sale's $21.65 credit came out of
  // the original's cash, and a gift-card-paid sale's credit came off its card.
  const payment = (fields: Partial<import('./saleForReturn').SalePayment>) =>
    ({ method: 'cash', amount: 0, gift_card_id: null, gift_cards: null, ...fields }) as import('./saleForReturn').SalePayment;
  const newSale = {
    sale_payments: [
      payment({ method: 'exchange', amount: 21.65, source_method: 'cash' }),
      payment({ method: 'cash', amount: 10.83 }),
      payment({ method: 'exchange', amount: 5, source_method: 'gift_card', source_gift_card_id: 'gc1', source_gift_card: { code: 'GC-1', is_active: true } }),
      payment({ method: 'exchange', amount: 2 }),
    ],
    refunds: [{ subtotal: 0, tax: 0, refund_lines: [], refund_payments: [{ method: 'cash', amount: 30, gift_card_id: null }] }],
  } as unknown as SaleData;

  it('counts each part of the credit as the payment type it came from', () => {
    const refundable = saleRefundable(newSale);
    expect(refundable.get('cash')).toBe(248); // $21.65 + $10.83 − $30 back
    expect(refundable.get('gift_card:gc1')).toBe(500);
    expect(refundable.get('credit')).toBeUndefined();
  });

  it('suggests the credit back the way it came, with the card\'s code, and leaves out a credit with no source', () => {
    expect(moneyPaymentsOf(newSale).map((p) => [p.method, p.amount, p.gift_cards?.code ?? null])).toEqual([
      ['cash', 21.65, null],
      ['cash', 10.83, null],
      ['gift_card', 5, 'GC-1'],
    ]);
  });

  it('counts an earlier refund\'s exchange payment against the type it came out of', () => {
    expect(bySource([{ method: 'exchange', amount: 21.65, gift_card_id: null, source_method: 'cash' }])).toEqual([
      { method: 'cash', amount: 21.65 },
    ]);
  });
});

describe('loadSaleForReturn', () => {
  it('looks up the code of a card an exchange payment came off (0082)', async () => {
    const sale = {
      id: 's1',
      sale_payments: [
        { method: 'exchange', amount: 5, gift_card_id: null, gift_cards: null, source_method: 'gift_card', source_gift_card_id: 'gc1' },
        { method: 'cash', amount: 3, gift_card_id: null, gift_cards: null },
      ],
    };
    const cardsQuery = { in: vi.fn(async () => ({ data: [{ gift_card_id: 'gc1', code: 'GC-1', is_active: false }], error: null })) };
    from.mockImplementation((table: string) =>
      table === 'sales'
        ? { select: () => ({ eq: () => ({ single: async () => ({ data: sale, error: null }) }) }) }
        : { select: () => cardsQuery },
    );
    const loaded = await loadSaleForReturn('s1');
    expect(cardsQuery.in).toHaveBeenCalledWith('gift_card_id', ['gc1']);
    expect(loaded.sale_payments[0].source_gift_card).toEqual({ code: 'GC-1', is_active: false });
    expect(loaded.sale_payments[1].source_gift_card).toBeUndefined();
  });

  it('passes on a failed load', async () => {
    from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'gone' } }) }) }) }));
    await expect(loadSaleForReturn('s1')).rejects.toEqual({ message: 'gone' });
  });
});
