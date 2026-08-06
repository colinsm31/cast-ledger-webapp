// Domain types mirroring the AceStock retail Postgres schema (migration 0008).
// Flexible JSONB columns (attributes, variant_values, enum_values) are typed as
// JsonValue.

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// ---- Attributes ----

export type AttributeValueType = 'number' | 'text' | 'enum' | 'bool';

export interface Category {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface AttributeDef {
  id: string;
  category_id: string;
  name: string;
  value_type: AttributeValueType;
  unit: string | null;
  required: boolean;
  is_variant_dimension: boolean;
  enum_values: JsonValue | null;
  sort_order: number;
  created_at: string;
}

// ---- Products & variants ----

export interface Product {
  id: string;
  category_id: string;
  brand: string | null;
  name: string;
  description: string | null;
  attributes: Record<string, JsonValue>;
  sell_price: number | null;
  cost: number | null;
  reorder_point: number | null;
  sku: string | null;
  barcode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// A product joined with its category (PostgREST embedded select).
export interface ProductWithCategory extends Product {
  categories: { name: string } | null;
}

export interface Variant {
  id: string;
  product_id: string;
  variant_values: Record<string, JsonValue>;
  sku: string | null;
  barcode: string | null;
  sell_price: number | null;
  cost: number | null;
  reorder_point: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// On-hand quantity per variant (from the variant_stock view).
export interface VariantStock {
  variant_id: string;
  on_hand: number;
}

// On-hand + low-stock detail per variant (from variant_stock_detail view).
export interface VariantStockDetail {
  variant_id: string;
  product_id: string;
  on_hand: number;
  reorder_point: number | null;
  is_low: boolean;
}

// Per-product stock roll-up (from product_stock view).
export interface ProductStock {
  product_id: string;
  on_hand: number;
  variant_count: number;
  has_low_stock: boolean;
}

// ---- Inventory ledger ----

export type InventoryTxnType = 'receive' | 'adjust' | 'sell' | 'transfer';

export interface InventoryTxn {
  id: string;
  txn_type: InventoryTxnType;
  variant_id: string;
  qty: number;
  unit_cost: number | null;
  location: string | null;
  sale_id: string | null;
  note: string | null;
  user_id: string | null;
  created_at: string;
}

// ---- Sales (light POS) ----

export interface Sale {
  id: string;
  sold_at: string;
  subtotal: number;
  note: string | null;
  customer_id: string | null;
  user_id: string | null;
  created_at: string;
}

// ---- Customers ----

export interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Display helper: "First Last".
export function customerName(c: Pick<Customer, 'first_name' | 'last_name'>): string {
  return `${c.first_name} ${c.last_name}`.trim();
}

// One purchased line for a customer's history (sale_line joined up to product).
export interface PurchaseHistoryRow {
  sale_id: string;
  sold_at: string;
  qty: number;
  unit_price: number;
  category: string;
  brand: string | null;
  product_name: string;
  variant_values: Record<string, JsonValue>;
}

export interface SaleLine {
  id: string;
  sale_id: string;
  variant_id: string;
  qty: number;
  unit_price: number;
  created_at: string;
}

// ---- Lookups (pick-or-add) ----

export interface LookupValue {
  id: string;
  kind: string;
  value: string;
  created_at: string;
}

export type LookupKind = 'brand' | 'color' | 'unit' | string;

// ---- RPC param shapes ----

export interface ReceiveStockParams {
  p_variant_id: string;
  p_qty: number;
  p_unit_cost: number | null;
  p_location: string | null;
  p_note: string | null;
}

export interface AdjustStockParams {
  p_variant_id: string;
  p_qty: number;
  p_note: string | null;
}

export interface SaleLineInput {
  variant_id: string;
  qty: number;
  unit_price: number;
}

export interface RecordSaleParams {
  p_lines: SaleLineInput[];
  p_customer_id: string | null;
  p_note: string | null;
}
