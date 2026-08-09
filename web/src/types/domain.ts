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

// On-hand + low-stock per product (from the product_stock view). Products are
// the stock-tracked items directly — there is no variant layer.
export interface ProductStock {
  product_id: string;
  on_hand: number;
  reorder_point: number | null;
  is_low: boolean;
}

// On-hand, committed (reserved by entered string jobs), and available on-hand
// minus committed (from the product_available view).
export interface ProductAvailable {
  product_id: string;
  on_hand: number;
  committed: number;
  available: number;
}

// ---- Inventory ledger ----

export type InventoryTxnType = 'receive' | 'adjust' | 'sell' | 'transfer';

export interface InventoryTxn {
  id: string;
  txn_type: InventoryTxnType;
  product_id: string;
  qty: number;
  unit_cost: number | null;
  location: string | null;
  sale_id: string | null;
  note: string | null;
  user_id: string | null;
  created_at: string;
}

// ---- Sales (light POS) ----

export type PaymentMethod = 'credit' | 'cash' | 'gift_card' | 'store_credit';

export interface Sale {
  id: string;
  sold_at: string;
  subtotal: number;
  payment_method: PaymentMethod | 'split' | null;
  note: string | null;
  customer_id: string | null;
  user_id: string | null;
  created_at: string;
}

// One tender on a sale (split payment).
export interface SalePayment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount: number;
  gift_card_id: string | null;
  created_at: string;
}

// A gift card's current balance (from the gift_card_balance view).
export interface GiftCardBalance {
  gift_card_id: string;
  code: string;
  customer_id: string | null;
  balance: number;
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

// Display helper: "Last, First" (for name search / directory listings).
export function customerNameLastFirst(c: Pick<Customer, 'first_name' | 'last_name'>): string {
  return [c.last_name?.trim(), c.first_name?.trim()].filter(Boolean).join(', ');
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
  attributes: Record<string, JsonValue>;
}

// A racket a customer owns (optionally linked to a catalog racket product).
export interface CustomerRacket {
  id: string;
  customer_id: string;
  product_id: string | null;
  brand: string | null;
  model: string;
  grip_size: string | null;
  barcode: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// A string job for a customer's racket (mains + crosses) with a lifecycle.
export type StringJobStatus = 'entered' | 'complete' | 'delivered' | 'cancelled';

export interface StringJob {
  id: string;
  customer_racket_id: string;
  status: StringJobStatus;

  // Optional catalog link to the string product used.
  main_product_id: string | null;
  main_brand: string | null;
  main_string: string | null;
  // Picked string attribute values keyed by their attribute names
  // (e.g. { gauge: '16', color: 'Black' }), captured at job time.
  main_specs: Record<string, JsonValue>;
  main_tension: number | null;

  cross_product_id: string | null;
  cross_brand: string | null;
  cross_string: string | null;
  cross_specs: Record<string, JsonValue>;
  cross_tension: number | null;

  price: number | null;
  strung_by: string | null;
  notes: string | null;
  // The sale that paid for this job, if any (null = unpaid).
  paid_sale_id: string | null;

  entered_at: string;
  completed_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleLine {
  id: string;
  sale_id: string;
  // Exactly one of product_id / string_job_id is set (product sale vs stringing).
  product_id: string | null;
  string_job_id: string | null;
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
  p_product_id: string;
  p_qty: number;
  p_unit_cost: number | null;
  p_location: string | null;
  p_note: string | null;
}

export interface AdjustStockParams {
  p_product_id: string;
  p_qty: number;
  p_note: string | null;
}

// A sale line references exactly one of a product or a string job (service).
export interface SaleLineInput {
  product_id?: string | null;
  string_job_id?: string | null;
  qty: number;
  unit_price: number;
}

export interface RecordSaleParams {
  p_lines: SaleLineInput[];
  p_customer_id: string | null;
  p_note: string | null;
}
