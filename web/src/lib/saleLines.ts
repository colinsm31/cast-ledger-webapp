// How a saved sale line is named: the product with its attributes, the gift
// card it loaded, or the stringing service. Shared by the sale page and receipts.
import type { JsonValue, SaleLineKind } from '../types/domain';
import { stringingLineName } from '../types/domain';

export interface SaleLineNameSource {
  kind: SaleLineKind;
  products: { brand: string | null; name: string; attributes: Record<string, JsonValue> | null } | null;
  gift_cards: { code: string } | null;
}

/** "Wilson Pro Staff 97 4 3/8", "Gift card GC-1234", or "Stringing". */
export function saleLineLabel(line: SaleLineNameSource): string {
  if (line.products) {
    const attrs = Object.values(line.products.attributes ?? {})
      .filter((value) => value != null && value !== '')
      .map(String);
    return [line.products.brand, line.products.name, ...attrs].filter(Boolean).join(' ');
  }
  if (line.gift_cards) return `Gift card ${line.gift_cards.code}`;
  return stringingLineName(line.kind);
}

/** A gift card code with all but its last 4 characters hidden: the code spends like cash. */
export function maskGiftCardCode(code: string): string {
  const visible = code.slice(-4);
  return code.length > 4 ? `••••${visible}` : visible;
}
