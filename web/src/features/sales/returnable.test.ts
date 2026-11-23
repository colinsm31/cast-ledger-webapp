import { describe, expect, it } from 'vitest';
import {
  frameReturnLine,
  frameReturnProblem,
  hasItemsToReturn,
  giftCardLoadRefundCents,
  giftCardLoadUnused,
  hasReturnable,
  isGiftCardLoadLine,
  isStringingLine,
  isUnitLine,
  refundPriceCents,
  refundSubtotals,
  returnableQty,
  returnedItemsLabel,
  stringingNote,
  taxedRefundedCents,
} from './returnable';

describe('returnedItemsLabel', () => {
  it('counts the items a refund returned', () => {
    expect(returnedItemsLabel([{ sale_line_id: 'grip', qty: 1 }])).toBe('1 item returned');
    expect(returnedItemsLabel([{ sale_line_id: 'grip', qty: 2 }, { sale_line_id: 'strings', qty: 1 }])).toBe('3 items returned');
  });
});

const lines = [
  { id: 'grip', product_id: 'p1', product_unit_id: null, qty: 3 },
  { id: 'racquet', product_id: 'p2', product_unit_id: 'u1', qty: 1 },
  { id: 'job', product_id: null, product_unit_id: null, qty: 1 },
];

describe('returnableQty', () => {
  it('counts product lines and racquet frames, not other lines', () => {
    expect(returnableQty(lines, [])).toEqual({ grip: 3, racquet: 1 });
  });

  it('subtracts what earlier refunds returned', () => {
    expect(
      returnableQty(lines, [
        { sale_line_id: 'grip', qty: 2 },
        { sale_line_id: 'job', qty: 1 },
        { sale_line_id: 'racquet', qty: 1 },
      ]),
    ).toEqual({ grip: 1, racquet: 0 });
  });
});

describe('hasReturnable', () => {
  it('is true for a racquet sale until the frame comes back', () => {
    expect(hasReturnable([lines[1]], [])).toBe(true);
    expect(hasReturnable([lines[1]], [{ sale_line_id: 'racquet', qty: 1 }])).toBe(false);
  });

  it('is false once everything returnable has been returned', () => {
    const allButGrip = [{ sale_line_id: 'racquet', qty: 1 }];
    expect(hasReturnable(lines, [...allButGrip, { sale_line_id: 'grip', qty: 3 }])).toBe(false);
    expect(hasReturnable(lines, [...allButGrip, { sale_line_id: 'grip', qty: 1 }])).toBe(true);
  });
});

describe('hasItemsToReturn', () => {
  it('is true once any item is chosen, whatever its price', () => {
    expect(hasItemsToReturn({ grip: 1 })).toBe(true);
    expect(hasItemsToReturn({ grip: 0, strings: 2 })).toBe(true);
  });

  it('is false when nothing is chosen', () => {
    expect(hasItemsToReturn({})).toBe(false);
    expect(hasItemsToReturn({ grip: 0 })).toBe(false);
  });
});

describe('a returned frame', () => {
  it('goes back in stock with no reason needed', () => {
    expect(frameReturnProblem({ status: 'in_stock', reason: '' })).toBeNull();
    expect(frameReturnLine('l1', { status: 'in_stock', reason: '  ' })).toEqual({
      sale_line_id: 'l1',
      qty: 1,
      unit_status: 'in_stock',
      unit_reason: null,
    });
  });

  it('is retired only with a reason of at most 200 characters', () => {
    expect(frameReturnProblem({ status: 'retired', reason: ' ' })).toBe('Say why the returned frame is retired.');
    expect(frameReturnProblem({ status: 'retired', reason: 'x'.repeat(201) })).toBe('Keep the reason to 200 characters.');
    expect(frameReturnLine('l1', { status: 'retired', reason: ' Cracked ' })).toMatchObject({
      unit_status: 'retired',
      unit_reason: 'Cracked',
    });
  });
});

describe('isUnitLine', () => {
  it('picks out a racquet frame\'s line', () => {
    expect(lines.map(isUnitLine)).toEqual([false, true, false]);
  });
});

describe('gift card loads (0075)', () => {
  const load = { id: 'load', product_id: null, product_unit_id: null, gift_card_id: 'gc1', qty: 1, unit_price: 25, taxable: false };

  it('are returnable whole, once', () => {
    expect(isGiftCardLoadLine(load)).toBe(true);
    expect(returnableQty([load], [])).toEqual({ load: 1 });
    expect(returnableQty([load], [{ sale_line_id: 'load', qty: 1 }])).toEqual({ load: 0 });
  });

  it('come back only while the card still holds all of the load', () => {
    expect(giftCardLoadUnused(load, 25)).toBe(true);
    expect(giftCardLoadUnused(load, 40)).toBe(true);
    expect(giftCardLoadUnused(load, 24.99)).toBe(false);
    expect(giftCardLoadUnused(load, undefined)).toBe(false);
  });

  it('add up to what an admin approves refunding (0078)', () => {
    const other = { ...load, id: 'load2', gift_card_id: 'gc2', unit_price: 20.5 };
    const grip = { id: 'grip', product_id: 'p1', product_unit_id: null, qty: 2, unit_price: 10, taxable: true };
    expect(giftCardLoadRefundCents([load, other, grip], { load: 1, load2: 1, grip: 2 })).toBe(4550);
    expect(giftCardLoadRefundCents([load, other, grip], { grip: 1 })).toBe(0);
  });
});

describe('stringing charges (0074)', () => {
  const stringing = { id: 'job', product_id: null, product_unit_id: null, string_job_id: 'j1', qty: 1, unit_price: 20, taxable: false };
  const grip = { id: 'grip', product_id: 'p1', product_unit_id: null, qty: 2, unit_price: 10, taxable: true };
  const giveBack = { sale_line_id: 'job', qty: 1, kind: 'string_change', unit_price: 8 };

  it('are refunded whole, once', () => {
    expect(isStringingLine(stringing)).toBe(true);
    expect(returnableQty([stringing], [])).toEqual({ job: 1 });
    expect(returnableQty([stringing], [{ sale_line_id: 'job', qty: 1, kind: 'return', unit_price: 20 }])).toEqual({ job: 0 });
  });

  it('give back their price less string-change give-backs, which don\'t count as returns', () => {
    expect(refundPriceCents(stringing, [giveBack])).toBe(1200);
    expect(returnableQty([stringing], [giveBack])).toEqual({ job: 1 });
    expect(returnableQty([stringing], [{ ...giveBack, unit_price: 20 }])).toEqual({ job: 0 });
    expect(returnedItemsLabel([giveBack, { sale_line_id: 'grip', qty: 1 }])).toBe('1 item returned');
  });

  it('count toward the refund but only taxed lines count toward tax', () => {
    expect(refundSubtotals([stringing, grip], [giveBack], { job: 1, grip: 1 })).toEqual({
      subtotalCents: 2200,
      taxableCents: 1000,
    });
    expect(
      taxedRefundedCents([stringing, grip], [giveBack, { sale_line_id: 'grip', qty: 1, kind: 'return', unit_price: 10 }]),
    ).toBe(1000);
  });

  it('say what refunding does to the job', () => {
    expect(stringingNote('entered')).toBe('not strung yet: refunding cancels the job');
    expect(stringingNote('complete')).toBe('strung and waiting: deliver it before refunding');
    expect(stringingNote('delivered')).toBe('the job stays on record, marked refunded');
  });
});
