import { describe, expect, it } from 'vitest';
import {
  frameReturnLine,
  frameReturnProblem,
  hasItemsToReturn,
  hasReturnable,
  isUnitLine,
  returnableQty,
  returnedItemsLabel,
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
