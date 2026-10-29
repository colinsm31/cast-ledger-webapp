import type { BarcodeMatch } from '../scan/resolveBarcode';

/**
 * Why a scanned code can't be a new unit's barcode, or null when it's free.
 * The server refuses these too (a code means one thing); this says so before
 * the list is submitted.
 */
export function barcodeInUseMessage(match: BarcodeMatch): string | null {
  const name = (p: { brand: string | null; name: string }) => [p.brand, p.name].filter(Boolean).join(' ');
  switch (match.kind) {
    case 'product':
      return `${match.code} is already the UPC of ${name(match.product)}.`;
    case 'unit':
      return `${match.code} is already the barcode of a ${name(match.product)} unit.`;
    case 'racket':
      return `${match.code} is already a customer's racquet tag.`;
    case 'gift_card':
      return `${match.code} is already a gift card's code.`;
    default:
      return null;
  }
}

/** The form codes are compared in, as the server does: EAN-13 with a leading 0 = UPC-A. */
export function barcodeCanonical(code: string): string {
  return /^0\d{12}$/.test(code) ? code.slice(1) : code;
}
