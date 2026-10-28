import { describe, expect, it } from 'vitest';
import { heldSaleFor, heldSaleSummary, type HeldSale } from './heldSale';

const held: HeldSale = {
  userId: 'staff-1',
  lines: [
    { key: 'a', productId: 'p1', label: 'Overgrip', price: '5', qty: 2 },
    { key: 'b', productId: 'p2', label: 'String', price: '20', qty: 1 },
  ],
  customer: null,
  stringJobId: null,
  deliverAfter: false,
};

describe('heldSaleFor', () => {
  it('returns the ticket only to the staff member who started it', () => {
    expect(heldSaleFor(held, 'staff-1')).toBe(held);
    expect(heldSaleFor(held, 'staff-2')).toBeNull();
    expect(heldSaleFor(held, undefined)).toBeNull();
  });

  it('ignores a ticket saved before tickets had an owner', () => {
    const old = { ...held, userId: undefined } as unknown as HeldSale;
    expect(heldSaleFor(old, 'staff-1')).toBeNull();
  });

  it('ignores an empty ticket', () => {
    expect(heldSaleFor({ ...held, lines: [] }, 'staff-1')).toBeNull();
  });
});

describe('heldSaleSummary', () => {
  it('counts items and names the customer', () => {
    expect(heldSaleSummary(held, 'Pat Family')).toBe('3 items, Pat Family');
    expect(heldSaleSummary({ ...held, lines: [held.lines[1]] }, null)).toBe('1 item');
  });
});
