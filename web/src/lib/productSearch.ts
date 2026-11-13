// Finding products at the register without a barcode (0060): by brand, name,
// SKU, barcode or attribute values, and the shop's one-tap quick picks.
import { supabase } from './supabase';
import type { ScannedProduct } from '../features/scan/resolveBarcode';

export const PRODUCT_SEARCH_LIMIT = 10;
export const QUICK_PICK_LIMIT = 12;

const REGISTER_PRODUCT_COLUMNS = 'id, brand, name, attributes, sell_price, is_serialized';

/** Active products where every typed word matches; throws the database error. */
export async function searchProducts(term: string, limit = PRODUCT_SEARCH_LIMIT): Promise<ScannedProduct[]> {
  if (!term.trim()) return [];
  const { data, error } = await supabase
    .rpc('search_products', { p_term: term, p_limit: limit })
    .select(REGISTER_PRODUCT_COLUMNS);
  if (error) throw error;
  return (data ?? []) as ScannedProduct[];
}

/** The active quick-pick products, by name; throws the database error. */
export async function fetchQuickPicks(limit = QUICK_PICK_LIMIT): Promise<ScannedProduct[]> {
  const { data, error } = await supabase
    .from('products')
    .select(REGISTER_PRODUCT_COLUMNS)
    .eq('quick_pick', true)
    .eq('is_active', true)
    .order('name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ScannedProduct[];
}

/** "$3.00" for a priced product, "no price" otherwise. */
export function priceLabel(product: Pick<ScannedProduct, 'sell_price'>): string {
  return product.sell_price == null ? 'no price' : `$${Number(product.sell_price).toFixed(2)}`;
}
