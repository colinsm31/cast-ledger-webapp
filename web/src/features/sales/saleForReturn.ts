// A sale as the return screens load it (RefundPage, ExchangePage), and what a
// return of some of it comes to. Tax follows record_refund: on the lines the
// sale taxed, cumulative over the sale's refunds, at the sale's rate, and
// never more than the sale charged.
import { supabase } from '../../lib/supabase';
import type { JsonValue, PaymentMethod } from '../../types/domain';
import { EXCHANGE_METHOD, type SavedPaymentMethod } from '../../lib/paymentMethods';
import {
  fromCents,
  refundableByMethod,
  refundSource,
  refundTaxCents,
  roundMoney,
  toCents,
} from '../../lib/saleMath';
import { refundSubtotals, taxedRefundedCents, type RefundedLine } from './returnable';

export interface SaleLine {
  id: string;
  product_id: string | null;
  product_unit_id: string | null;
  string_job_id: string | null;
  gift_card_id: string | null;
  qty: number;
  unit_price: number;
  taxable: boolean;
  /** 'string_change' for a string change's charge (0043); 'charge' otherwise. */
  kind?: string;
  products: { brand: string | null; name: string; attributes: Record<string, JsonValue> | null } | null;
  string_jobs: { job_number: number; status: string; refund_id?: string | null } | null;
  gift_cards: { code: string } | null;
}

export interface SalePayment {
  method: SavedPaymentMethod;
  amount: number;
  gift_card_id: string | null;
  gift_cards: { code: string; is_active?: boolean } | null;
}

export interface EarlierRefund {
  subtotal: number;
  tax: number;
  refund_lines: { sale_line_id: string; qty: number; kind: string; unit_price: number }[];
  refund_payments: { method: PaymentMethod; amount: number; gift_card_id: string | null }[];
}

/** The exchange that paid for a sale with returned items (0077), and the sale they came from. */
export interface ExchangeCredit {
  credit: number;
  refunds: {
    sales: {
      sale_payments: { method: SavedPaymentMethod; amount: number }[];
      refunds: { refund_payments: { method: PaymentMethod; amount: number }[] }[];
    } | null;
  } | null;
}

export interface SaleData {
  id: string;
  tax: number;
  tax_rate: number;
  customer_id: string | null;
  customers: { first_name: string; last_name: string; is_active?: boolean } | null;
  sale_lines: SaleLine[];
  sale_payments: SalePayment[];
  refunds: EarlierRefund[];
  /** Set when an exchange paid for this sale (PostgREST gives one object, or a list). */
  exchanges?: ExchangeCredit | ExchangeCredit[] | null;
}

const SALE_FOR_RETURN_SELECT = [
  'id, tax, tax_rate, customer_id',
  'customers ( first_name, last_name, is_active )',
  'sale_lines ( id, product_id, product_unit_id, string_job_id, gift_card_id, qty, unit_price, taxable, kind, products ( brand, name, attributes ), string_jobs ( job_number, status, refund_id ), gift_cards ( code ) )',
  'sale_payments ( method, amount, gift_card_id, gift_cards ( code, is_active ) )',
  'refunds ( subtotal, tax, refund_lines ( sale_line_id, qty, kind, unit_price ), refund_payments ( method, amount, gift_card_id ) )',
  'exchanges ( credit, refunds ( sales ( sale_payments ( method, amount ), refunds ( refund_payments ( method, amount ) ) ) ) )',
].join(', ');

/** The sale with its lines, payments and earlier refunds; throws the database error. */
export async function loadSaleForReturn(saleId: string): Promise<SaleData> {
  const { data, error } = await supabase.from('sales').select(SALE_FOR_RETURN_SELECT).eq('id', saleId).single();
  if (error) throw error;
  return data as unknown as SaleData;
}

/** Whether the sale's customer has been made inactive (0076): they can't take part in a new sale or refund to store credit. */
export function saleCustomerInactive(sale: SaleData | null): boolean {
  return sale?.customers?.is_active === false;
}

/** A payment the money can go back to: not an exchange's credit, nor an inactive gift card (0076). */
export function canRefundTo(payment: SalePayment): boolean {
  return payment.method !== 'exchange' && payment.gift_cards?.is_active !== false;
}

/** The sale's payments that money can go back to: all but an exchange's credit. */
export function moneyPaymentsOf(sale: SaleData | null): (SalePayment & { method: PaymentMethod })[] {
  return (sale?.sale_payments ?? []).filter(
    (p): p is SalePayment & { method: PaymentMethod } => p.method !== EXCHANGE_METHOD,
  );
}

/**
 * An exchange's credit, as the original sale's payment types (sale_refundable_by_method,
 * 0081): each money type the original can still give back, up to the credit.
 * Gift cards keep their own per-card rule, so they're left out.
 */
export function exchangeCreditPayments(sale: SaleData | null): (SalePayment & { method: PaymentMethod })[] {
  const exchange = Array.isArray(sale?.exchanges) ? sale.exchanges[0] : sale?.exchanges;
  const original = exchange?.refunds?.sales;
  if (!exchange || !original) return [];
  const creditCents = toCents(Number(exchange.credit));
  const originalRefundable = refundableByMethod(
    original.sale_payments.filter((p): p is { method: PaymentMethod; amount: number } => p.method !== EXCHANGE_METHOD),
    original.refunds.flatMap((r) => r.refund_payments ?? []),
  );
  return [...originalRefundable.entries()]
    .filter(([method, cents]) => method !== 'gift_card' && cents > 0)
    .map(([method, cents]) => ({
      method,
      amount: fromCents(Math.min(creditCents, cents)),
      gift_card_id: null,
      gift_cards: null,
    }));
}

/**
 * What each payment type (a gift card by card) can still give back without a
 * payment-type change, as the server works it out: the sale's money payments
 * and any exchange credit, less what earlier refunds gave back.
 */
export function saleRefundable(sale: SaleData | null): Map<string, number> {
  return refundableByMethod(
    bySource([...moneyPaymentsOf(sale), ...exchangeCreditPayments(sale)]),
    bySource((sale?.refunds ?? []).flatMap((r) => r.refund_payments)),
  );
}

/** Every line earlier refunds gave back. */
export function refundedLinesOf(sale: SaleData | null): RefundedLine[] {
  return (sale?.refunds ?? []).flatMap((r) => r.refund_lines ?? []);
}

/** Payments keyed by what limits a refund: the type, or the gift card itself. */
export function bySource(payments: { method: SavedPaymentMethod; amount: number; gift_card_id: string | null }[]) {
  return payments.map((p) => ({ method: refundSource(p.method, p.gift_card_id), amount: p.amount }));
}

/** "Brand Name Attr Attr" for a product line. */
export function lineLabel(p: SaleLine['products']): string {
  if (!p) return '—';
  const attrs = Object.values(p.attributes ?? {}).filter((v) => v != null && v !== '').map(String);
  return [p.brand, p.name, ...attrs].filter(Boolean).join(' ');
}

/** Refund subtotal, tax and total, in dollars, for a set of return quantities. */
export function refundTotals(sale: SaleData | null, qty: Record<string, number>) {
  if (!sale) return { subtotal: 0, tax: 0, total: 0 };
  const refundedLines = refundedLinesOf(sale);
  const { subtotalCents, taxableCents } = refundSubtotals(sale.sale_lines, refundedLines, qty);
  const taxCentsForRefund = refundTaxCents({
    previousSubtotalCents: taxedRefundedCents(sale.sale_lines, refundedLines),
    previousTaxCents: sale.refunds.reduce((s, r) => s + toCents(r.tax), 0),
    saleTaxCents: toCents(sale.tax),
    refundSubtotalCents: taxableCents,
    taxRate: sale.tax_rate,
  });
  return {
    subtotal: fromCents(subtotalCents),
    tax: fromCents(taxCentsForRefund),
    total: fromCents(subtotalCents + taxCentsForRefund),
  };
}

/** An exchange's difference after the return's credit: positive is owed by the customer, negative is owed to them. */
export function exchangeDifference(newTotal: number, credit: number): number {
  return roundMoney(newTotal - credit);
}
