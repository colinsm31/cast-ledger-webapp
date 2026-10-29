import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHeldSale, getHeldSale, heldSaleFor, heldSaleSummary, setHeldSale, type HeldSale } from './heldSale';

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

// Browser storage, faked: the tests run outside a browser.
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

describe('saving a held ticket', () => {
  let storage: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal('localStorage', storage);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('saves and loads each staff member\'s ticket under their own key', () => {
    setHeldSale('staff-1', held);
    expect(storage.items.has('acestock.heldSale:staff-1')).toBe(true);
    expect(getHeldSale('staff-1')).toEqual(held);
    expect(getHeldSale('staff-2')).toBeNull();
    expect(getHeldSale(undefined)).toBeNull();
  });

  it("records who started it, whatever the ticket says", () => {
    setHeldSale('staff-2', held);
    expect(getHeldSale('staff-2')?.userId).toBe('staff-2');
  });

  it("clears only that staff member's ticket", () => {
    setHeldSale('staff-1', held);
    setHeldSale('staff-2', held);
    clearHeldSale('staff-1');
    expect(getHeldSale('staff-1')).toBeNull();
    expect(getHeldSale('staff-2')).not.toBeNull();
  });

  it('removes the ticket when it has no lines, and the old shared key on any save', () => {
    storage.setItem('acestock.heldSale', '{}');
    setHeldSale('staff-1', held);
    setHeldSale('staff-1', { ...held, lines: [] });
    expect(storage.items.has('acestock.heldSale:staff-1')).toBe(false);
    expect(storage.items.has('acestock.heldSale')).toBe(false);
  });

  it('treats unreadable or unavailable storage as no ticket', () => {
    storage.setItem('acestock.heldSale:staff-1', 'not json');
    expect(getHeldSale('staff-1')).toBeNull();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(getHeldSale('staff-1')).toBeNull();
    expect(() => setHeldSale('staff-1', held)).not.toThrow();
  });
});
