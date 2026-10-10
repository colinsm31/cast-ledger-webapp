import { describe, expect, it } from 'vitest';
import {
  allocateToOriginalPayments,
  computeSaleTotals,
  lineTotalCents,
  paymentTypeChanges,
  refundableByMethod,
  refundTaxCents,
  roundMoney,
  taxCents,
  toCents,
} from './saleMath';

const shopRules = { taxRate: 8.25, taxStringing: false };

describe('toCents', () => {
  it('converts typed and stored prices to whole cents', () => {
    expect(toCents('19.99')).toBe(1999);
    expect(toCents(20)).toBe(2000);
    expect(toCents('0.1')).toBe(10);
  });

  it('treats blank or non-numeric input as zero', () => {
    expect(toCents('')).toBe(0);
    expect(toCents('abc')).toBe(0);
  });
});

describe('roundMoney', () => {
  it('removes floating-point noise from sums', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(21.65 - 10)).toBe(11.65);
  });
});

describe('taxCents', () => {
  it('rounds half a cent up, like Postgres round(numeric, 2)', () => {
    expect(taxCents(3000, 8.25)).toBe(248); // $30 × 8.25% = 2.475
    expect(taxCents(25000, 8.25)).toBe(2063); // $250 × 8.25% = 20.625
  });

  // Half-cent cases the old floating-point register math rounded down while
  // the database rounds up, leaving the register a cent short of the total
  // record_sale requires (so the sale was rejected).
  it('agrees with the database where floating-point dollars did not', () => {
    expect(taxCents(10200, 8.25)).toBe(842); // $102 → 8.415, was 8.41
    expect(taxCents(11000, 8.25)).toBe(908); // $110 → 9.075, was 9.07
    expect(taxCents(39000, 8.25)).toBe(3218); // $390 → 32.175, was 32.17
  });

  it('handles ordinary amounts and fractional rates', () => {
    expect(taxCents(4000, 8.25)).toBe(330);
    expect(taxCents(2000, 10)).toBe(200);
    expect(taxCents(1999, 8.875)).toBe(177); // 177.41 → 177
    expect(taxCents(1000, 7.3)).toBe(73);
  });

  it('is zero for no rate or nothing taxable', () => {
    expect(taxCents(5000, 0)).toBe(0);
    expect(taxCents(0, 8.25)).toBe(0);
  });
});

describe('lineTotalCents', () => {
  it('multiplies quantity by the unit price in cents', () => {
    expect(lineTotalCents({ qty: 3, price: '19.99' })).toBe(5997);
  });
});

describe('computeSaleTotals', () => {
  it('taxes product lines at the shop rate', () => {
    expect(computeSaleTotals([{ qty: 2, price: '20' }], shopRules)).toEqual({
      subtotal: 40,
      tax: 3.3,
      total: 43.3,
    });
  });

  it('does not tax stringing unless the shop taxes it', () => {
    const lines = [{ qty: 1, price: '30', stringJobId: 'job-1' }];
    expect(computeSaleTotals(lines, shopRules).tax).toBe(0);
    expect(computeSaleTotals(lines, { ...shopRules, taxStringing: true })).toEqual({
      subtotal: 30,
      tax: 2.48,
      total: 32.48,
    });
  });

  it('never taxes gift card loads', () => {
    const lines = [{ qty: 1, price: '75', giftCardId: 'card-1' }];
    expect(computeSaleTotals(lines, shopRules)).toEqual({ subtotal: 75, tax: 0, total: 75 });
  });

  // Same ticket as the database test (supabase/tests/02_record_refund.sql):
  // the register must ask for exactly what record_sale will require.
  it('matches record_sale on a mixed ticket', () => {
    const lines = [
      { qty: 3, price: 20 },
      { qty: 1, price: 30, stringJobId: 'job-1' },
      { qty: 1, price: 250 },
    ];
    expect(computeSaleTotals(lines, shopRules)).toEqual({ subtotal: 340, tax: 25.58, total: 365.58 });
  });

  it('counts an unparseable price as zero instead of producing NaN', () => {
    expect(computeSaleTotals([{ qty: 1, price: '' }], shopRules)).toEqual({ subtotal: 0, tax: 0, total: 0 });
  });
});

describe('refundTaxCents', () => {
  const sale = { saleTaxCents: 83, taxRate: 8.25 }; // 2 × $5.05 at 8.25%

  it('gives back exactly the sale tax when items are refunded one at a time', () => {
    const first = refundTaxCents({ ...sale, previousSubtotalCents: 0, previousTaxCents: 0, refundSubtotalCents: 505 });
    const second = refundTaxCents({
      ...sale,
      previousSubtotalCents: 505,
      previousTaxCents: first,
      refundSubtotalCents: 505,
    });
    expect([first, second]).toEqual([42, 41]);
    expect(first + second).toBe(83);
  });

  it('never refunds more tax than the sale charged', () => {
    expect(
      refundTaxCents({ saleTaxCents: 50, taxRate: 10, previousSubtotalCents: 0, previousTaxCents: 0, refundSubtotalCents: 1000 }),
    ).toBe(50);
  });

  it('is never negative, even after an earlier over-refund', () => {
    expect(
      refundTaxCents({ ...sale, previousSubtotalCents: 505, previousTaxCents: 84, refundSubtotalCents: 505 }),
    ).toBe(0);
  });
});

describe('refund payment types', () => {
  const salePayments = [
    { method: 'cash', amount: 20 },
    { method: 'credit', amount: 23.3 },
  ];

  it('tracks what each payment type can still give back', () => {
    const refundable = refundableByMethod(salePayments, [{ method: 'cash', amount: 15 }]);
    expect(Object.fromEntries(refundable)).toEqual({ cash: 500, credit: 2330 });
  });

  it('flags only the types a refund over-sends to', () => {
    const refundable = refundableByMethod(salePayments, []);
    expect(paymentTypeChanges(refundable, [{ method: 'cash', amount: 20 }, { method: 'credit', amount: 1.65 }])).toEqual([]);
    expect(paymentTypeChanges(refundable, [{ method: 'cash', amount: 21.65 }])).toEqual(['cash']);
    expect(paymentTypeChanges(refundable, [{ method: 'store_credit', amount: 5 }])).toEqual(['store_credit']);
  });

  it('splits a refund back across the original payments in order', () => {
    const refundable = refundableByMethod(salePayments, []);
    const { allocations, unallocatedCents } = allocateToOriginalPayments(2165, salePayments, refundable);
    expect(allocations.map((a) => [a.payment.method, a.cents])).toEqual([['cash', 2000], ['credit', 165]]);
    expect(unallocatedCents).toBe(0);
  });

  it('leaves the rest unallocated when the original types are used up', () => {
    const refundable = refundableByMethod(salePayments, [{ method: 'cash', amount: 20 }, { method: 'credit', amount: 23.3 }]);
    expect(allocateToOriginalPayments(1000, salePayments, refundable)).toEqual({ allocations: [], unallocatedCents: 1000 });
  });
});
