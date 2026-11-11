import { describe, expect, it } from 'vitest';
import {
  applyServerListPrices,
  isPriceChanged,
  isPriceReasonError,
  missingPriceReasons,
  priceChangeNote,
  priceReasonOf,
} from './priceOverride';

const overgrip = { label: 'Overgrip', price: '20', listPrice: 20 };

describe('isPriceChanged', () => {
  it('is false at the list price, however it is typed', () => {
    expect(isPriceChanged(overgrip)).toBe(false);
    expect(isPriceChanged({ ...overgrip, price: '20.00' })).toBe(false);
  });

  it('is true for a lower or a higher price', () => {
    expect(isPriceChanged({ ...overgrip, price: '15' })).toBe(true);
    expect(isPriceChanged({ ...overgrip, price: '22.50' })).toBe(true);
  });

  it('treats a blank price as $0', () => {
    expect(isPriceChanged({ ...overgrip, price: '' })).toBe(true);
  });

  it('is false with no list price (gift card, unpriced item) or one not known yet', () => {
    expect(isPriceChanged({ label: 'Gift card', price: '50', listPrice: null })).toBe(false);
    expect(isPriceChanged({ label: 'Held', price: '15' })).toBe(false);
  });
});

describe('priceReasonOf', () => {
  it('trims, and treats blank as none', () => {
    expect(priceReasonOf({ priceReason: ' Damaged ' })).toBe('Damaged');
    expect(priceReasonOf({ priceReason: '  ' })).toBeUndefined();
    expect(priceReasonOf({})).toBeUndefined();
  });
});

describe('missingPriceReasons', () => {
  it('names each changed line without a reason', () => {
    expect(
      missingPriceReasons([
        overgrip,
        { ...overgrip, label: 'Strings', price: '15' },
        { ...overgrip, label: 'Bag', price: '15', priceReason: 'Damaged' },
      ]),
    ).toEqual(['Strings: the price changed from $20.00, so give a reason.']);
  });
});

describe('applyServerListPrices', () => {
  it('changes nothing when the server agrees', () => {
    const lines = [overgrip, { label: 'Gift card', price: '50', listPrice: null }];
    expect(applyServerListPrices(lines, [20, null])).toEqual({ lines, notices: [], changed: false });
  });

  it('moves an unchanged line to the new catalog price, with a notice', () => {
    expect(applyServerListPrices([overgrip], [22])).toEqual({
      lines: [{ ...overgrip, price: '22.00', listPrice: 22 }],
      notices: ['Overgrip is now $22.00 (it was $20.00).'],
      changed: true,
    });
  });

  it('keeps a changed price and takes the new list price', () => {
    const line = { ...overgrip, price: '15', priceReason: 'Damaged' };
    expect(applyServerListPrices([line], [22])).toEqual({
      lines: [{ ...line, listPrice: 22 }],
      notices: [],
      changed: true,
    });
  });

  it('fills in the list price of a ticket held before they were kept', () => {
    expect(applyServerListPrices([{ label: 'Held', price: '15' }], [20])).toEqual({
      lines: [{ label: 'Held', price: '15', listPrice: 20 }],
      notices: [],
      changed: true,
    });
  });

  it('drops the list price when the catalog no longer has one', () => {
    expect(applyServerListPrices([overgrip], [null]).lines).toEqual([{ ...overgrip, listPrice: null }]);
  });
});

describe('priceChangeNote', () => {
  it('shows the change and the reason', () => {
    expect(priceChangeNote('25.00', '20.00', 'Price match')).toBe('List $25.00 → $20.00 · Price match');
    expect(priceChangeNote(25, 30, null)).toBe('List $25.00 → $30.00');
  });

  it('says nothing at the list price or with none', () => {
    expect(priceChangeNote(20, '20.00', null)).toBeNull();
    expect(priceChangeNote(null, 20, null)).toBeNull();
  });
});

describe('isPriceReasonError', () => {
  it('spots record_sale refusing a changed price with no reason', () => {
    expect(isPriceReasonError({ message: 'Price changed from $20.00 on line 2: give a reason' })).toBe(true);
  });

  it('ignores other errors and non-errors', () => {
    expect(isPriceReasonError({ message: 'Sale line price must be >= 0' })).toBe(false);
    expect(isPriceReasonError('Price changed from $20.00: give a reason')).toBe(false);
    expect(isPriceReasonError(null)).toBe(false);
  });
});
