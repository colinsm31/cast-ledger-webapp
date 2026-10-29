import { describe, expect, it } from 'vitest';
import { productSaveError } from './productSaveError';

describe('productSaveError', () => {
  it('names the duplicated field', () => {
    expect(productSaveError({ message: 'duplicate key value violates unique constraint "uq_products_barcode"' })).toBe(
      'That UPC is already used by another product.',
    );
    expect(productSaveError({ message: 'duplicate key value violates unique constraint "uq_products_sku"' })).toBe(
      'That SKU is already used by another product.',
    );
  });

  it("passes other errors on, including the barcode guard's own message", () => {
    expect(productSaveError({ message: 'Barcode 123 is already a customer racquet tag' })).toBe(
      'Barcode 123 is already a customer racquet tag',
    );
    expect(productSaveError(null)).toBe('Something went wrong.');
  });
});
