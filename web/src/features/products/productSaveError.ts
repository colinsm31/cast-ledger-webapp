import { errorMessage } from '../../lib/errors';

// A product's unique fields, by the database index that keeps them unique.
const UNIQUE_FIELDS: Record<string, string> = {
  uq_products_barcode: 'That UPC is already used by another product.',
  uq_products_sku: 'That SKU is already used by another product.',
};

/**
 * The message for a failed product save. A duplicate names the field that's
 * taken (UPC or SKU) rather than always blaming the UPC (code review #41);
 * anything else, including the barcode guard's own "already used by …"
 * message, is shown as it is.
 */
export function productSaveError(error: unknown): string {
  const raw = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  for (const [index, message] of Object.entries(UNIQUE_FIELDS)) {
    if (raw.includes(index)) return message;
  }
  return errorMessage(error);
}
