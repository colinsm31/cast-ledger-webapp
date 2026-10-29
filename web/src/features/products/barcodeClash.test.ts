import { describe, expect, it } from 'vitest';
import { barcodeCanonical, barcodeInUseMessage } from './barcodeClash';
import type { ScannedProduct } from '../scan/resolveBarcode';

const product: ScannedProduct = {
  id: 'p1',
  brand: 'Babolat',
  name: 'RPM Blast',
  attributes: null,
  sell_price: 19,
  is_serialized: false,
};

describe('barcodeInUseMessage', () => {
  it('names what already uses the code', () => {
    expect(barcodeInUseMessage({ kind: 'product', code: '012345678905', product })).toBe(
      '012345678905 is already the UPC of Babolat RPM Blast.',
    );
    expect(
      barcodeInUseMessage({
        kind: 'unit',
        code: 'RQ-1',
        unitId: 'u1',
        productId: 'p1',
        status: 'in_stock',
        product: { ...product, is_serialized: true },
      }),
    ).toBe('RQ-1 is already the barcode of a Babolat RPM Blast unit.');
    expect(
      barcodeInUseMessage({ kind: 'racket', code: 'TAG-1', racketId: 'r1', customerId: 'c1', openJobId: null }),
    ).toBe("TAG-1 is already a customer's racquet tag.");
    expect(barcodeInUseMessage({ kind: 'gift_card', code: 'GC-1', giftCardId: 'g1', customerId: null })).toBe(
      "GC-1 is already a gift card's code.",
    );
  });

  it('leaves out a missing brand', () => {
    expect(barcodeInUseMessage({ kind: 'product', code: '1', product: { ...product, brand: null } })).toBe(
      '1 is already the UPC of RPM Blast.',
    );
  });

  it('allows a code nothing uses', () => {
    expect(barcodeInUseMessage({ kind: 'none', code: 'NEW-1' })).toBeNull();
  });
});

describe('barcodeCanonical', () => {
  it('treats the EAN-13 form of a UPC-A as the same code', () => {
    expect(barcodeCanonical('0012345678905')).toBe('012345678905');
    expect(barcodeCanonical('012345678905')).toBe('012345678905');
  });

  it('leaves other codes alone', () => {
    expect(barcodeCanonical('1012345678905')).toBe('1012345678905');
    expect(barcodeCanonical('RQ-0001')).toBe('RQ-0001');
  });
});
