import { describe, expect, it } from 'vitest';
import { hasItemsToReturn, hasReturnable, returnableQty, returnedItemsLabel } from './returnable';

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
  it('leaves out racquet units and non-product lines', () => {
    expect(returnableQty(lines, [])).toEqual({ grip: 3 });
  });

  it('subtracts what earlier refunds returned', () => {
    expect(returnableQty(lines, [{ sale_line_id: 'grip', qty: 2 }, { sale_line_id: 'job', qty: 1 }])).toEqual({ grip: 1 });
  });
});

describe('hasReturnable', () => {
  it('is false for a racquet-only sale', () => {
    expect(hasReturnable([lines[1]], [])).toBe(false);
  });

  it('is false once everything returnable has been returned', () => {
    expect(hasReturnable(lines, [{ sale_line_id: 'grip', qty: 3 }])).toBe(false);
    expect(hasReturnable(lines, [{ sale_line_id: 'grip', qty: 1 }])).toBe(true);
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
