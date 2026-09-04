import { supabase } from '../../lib/supabase';
import { normalizeBarcode } from '../../lib/barcode';
import type { JsonValue, ProductUnitStatus } from '../../types/domain';

// MARK: - Types

/** A product as returned by a scan — enough to show and price a POS line. */
export interface ScannedProduct {
  id: string;
  brand: string | null;
  name: string;
  attributes: Record<string, JsonValue> | null;
  sell_price: number | null;
  // Serialized products (rackets) are received/sold as individual units.
  is_serialized: boolean;
}

/** What a scanned code turned out to be. */
export type BarcodeMatch =
  | { kind: 'product'; code: string; product: ScannedProduct }
  | {
      kind: 'unit';
      code: string;
      unitId: string;
      productId: string;
      status: ProductUnitStatus;
      product: ScannedProduct;
    }
  | { kind: 'racket'; code: string; racketId: string; customerId: string; openJobId: string | null }
  | { kind: 'gift_card'; code: string; giftCardId: string; customerId: string | null }
  | { kind: 'none'; code: string };

/** Raw row shape of the `resolve_barcode` RPC. */
interface ResolveBarcodeRow {
  kind: 'product' | 'unit' | 'racket' | 'gift_card' | 'none';
  code: string;
  id: string | null;
  product_id: string | null;
  customer_id: string | null;
  open_job_id: string | null;
  brand: string | null;
  name: string | null;
  attributes: Record<string, JsonValue> | null;
  sell_price: number | null;
  is_serialized: boolean | null;
  unit_status: ProductUnitStatus | null;
}

// MARK: - Lookup

/**
 * Resolve a scanned / typed code via the `resolve_barcode` RPC (one round
 * trip; handles UPC-A vs EAN-13 normalization server-side).
 *
 * Throws on a database error so callers can surface `errorMessage(err)`.
 */
export async function resolveBarcode(raw: string): Promise<BarcodeMatch> {
  const code = normalizeBarcode(raw);
  if (!code) return { kind: 'none', code };

  const { data, error } = await supabase.rpc('resolve_barcode', { p_code: code }).single();
  if (error) throw error;

  return toMatch(data as ResolveBarcodeRow);
}

// MARK: - Private Helpers

function toMatch(row: ResolveBarcodeRow): BarcodeMatch {
  switch (row.kind) {
    case 'product':
      return {
        kind: 'product',
        code: row.code,
        product: {
          id: row.id ?? '',
          brand: row.brand,
          name: row.name ?? '',
          attributes: row.attributes,
          sell_price: row.sell_price,
          is_serialized: row.is_serialized ?? false,
        },
      };
    case 'unit':
      return {
        kind: 'unit',
        code: row.code,
        unitId: row.id ?? '',
        productId: row.product_id ?? '',
        status: (row.unit_status ?? 'in_stock') as ProductUnitStatus,
        product: {
          id: row.product_id ?? '',
          brand: row.brand,
          name: row.name ?? '',
          attributes: row.attributes,
          sell_price: row.sell_price,
          is_serialized: true,
        },
      };
    case 'racket':
      return {
        kind: 'racket',
        code: row.code,
        racketId: row.id ?? '',
        customerId: row.customer_id ?? '',
        openJobId: row.open_job_id,
      };
    case 'gift_card':
      return { kind: 'gift_card', code: row.code, giftCardId: row.id ?? '', customerId: row.customer_id };
    default:
      return { kind: 'none', code: row.code };
  }
}

/** Where the app should go for a given match, or null when nothing matched. */
export function routeForMatch(match: BarcodeMatch): string | null {
  switch (match.kind) {
    case 'product':
      // A serialized product (racket) scanned to receive opens its receive sheet.
      return match.product.is_serialized
        ? `/products/${match.product.id}?receive=1`
        : `/products/${match.product.id}`;
    case 'unit':
      // A specific racket scanned: show its model (sell it from the units list).
      return `/products/${match.productId}`;
    case 'racket':
      // Reopen the racket's open job, else start a new restring for it.
      return match.openJobId
        ? `/string-jobs/${match.openJobId}`
        : `/customers/${match.customerId}/rackets/${match.racketId}/restring`;
    case 'gift_card':
      return `/gift-cards?code=${encodeURIComponent(match.code)}`;
    default:
      return null;
  }
}
