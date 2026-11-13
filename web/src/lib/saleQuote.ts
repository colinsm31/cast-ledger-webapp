// The server's quote for a ticket (quote_sale): the total record_sale will
// require, worked out by the same database function, plus every line that
// can't be sold as it stands. The register asks for it when Payment Type is
// pressed, so the payment screen never asks for an amount the server refuses.
import { supabase } from './supabase';
import { fromCents, toCents, type SaleTotals } from './saleMath';
import { priceReasonOf } from './priceOverride';
import { discountReasonOf, discountValue } from './discounts';

/** A ticket line as the register holds it. */
export interface SaleLineInput {
  productId?: string;
  productUnitId?: string;
  stringJobId?: string;
  giftCardId?: string;
  qty: number;
  /** Unit price as typed (string) or stored (number). */
  price: string | number;
  /** Why the price differs from the list price, if it does. */
  priceReason?: string;
  /** The line's discount box, as typed (see lib/discounts). */
  discount?: string;
  discountReason?: string;
}

/** The whole ticket's discount box and reason, as typed. */
export interface TicketDiscountInput {
  discount?: string;
  discountReason?: string;
}

/** What quote_sale and record_sale take besides the lines. */
export interface SaleQuoteOptions {
  ticket?: TicketDiscountInput;
  /** An admin's one-time approval for discounts over the staff limit. */
  approvalId?: string | null;
}

/** One line in the shape quote_sale and record_sale take. */
export type SaleLinePayload = (
  | { string_job_id: string; qty: number; unit_price: number }
  | { gift_card_id: string; qty: number; unit_price: number }
  | { product_id: string | undefined; product_unit_id?: string; qty: number; unit_price: number }
) & { price_reason?: string; discount?: number; discount_reason?: string };

export interface QuoteProblem {
  /** 0-based position of the line on the ticket; null for the whole ticket (its discount, the staff limit). */
  line: number | null;
  message: string;
}

export interface SaleQuote {
  subtotal: number;
  tax: number;
  /** Percent, e.g. 8.25. */
  taxRate: number;
  total: number;
  problems: QuoteProblem[];
  /** Each line's list price now, in ticket order (null: none to change from). */
  listPrices: (number | null)[];
  /** Everything the discounts take off. */
  discountTotal: number;
  /** How far below its catalog price the furthest item is, in percent. */
  maxDiscountPercent: number;
  /** The customer's exemption ID when the sale is tax-exempt, else null. */
  taxExemptId: string | null;
}

interface QuoteRow {
  subtotal: number | string;
  tax: number | string;
  tax_rate: number | string;
  total: number | string;
  problems: QuoteProblem[] | null;
  lines?: { list_price: number | string | null }[] | null;
  discount_total?: number | string | null;
  max_discount_percent?: number | string | null;
  tax_exempt_id?: string | null;
}

export function toSaleLinePayload(line: SaleLineInput): SaleLinePayload {
  const unit_price = Number(line.price) || 0;
  const priceReason = priceReasonOf(line);
  const discount = discountValue(line.discount);
  const discountReason = discountReasonOf(line);
  const reason = {
    ...(priceReason ? { price_reason: priceReason } : {}),
    ...(discount != null ? { discount } : {}),
    ...(discount != null && discountReason ? { discount_reason: discountReason } : {}),
  };
  if (line.stringJobId) return { string_job_id: line.stringJobId, qty: line.qty, unit_price, ...reason };
  if (line.giftCardId) return { gift_card_id: line.giftCardId, qty: line.qty, unit_price, ...reason };
  if (line.productUnitId) {
    return { product_id: line.productId, product_unit_id: line.productUnitId, qty: 1, unit_price, ...reason };
  }
  return { product_id: line.productId, qty: line.qty, unit_price, ...reason };
}

export function parseSaleQuote(row: QuoteRow): SaleQuote {
  return {
    subtotal: Number(row.subtotal),
    tax: Number(row.tax),
    taxRate: Number(row.tax_rate),
    total: Number(row.total),
    problems: row.problems ?? [],
    listPrices: (row.lines ?? []).map((line) => (line.list_price == null ? null : Number(line.list_price))),
    discountTotal: Number(row.discount_total ?? 0),
    maxDiscountPercent: Number(row.max_discount_percent ?? 0),
    taxExemptId: row.tax_exempt_id ?? null,
  };
}

/** The ticket discount in the shape quote_sale and record_sale take, or null for none. */
export function toTicketPayload(ticket: TicketDiscountInput | undefined): { discount: number; discount_reason?: string } | null {
  const discount = discountValue(ticket?.discount);
  if (discount == null) return null;
  const reason = ticket ? discountReasonOf(ticket) : undefined;
  return reason ? { discount, discount_reason: reason } : { discount };
}

/** The arguments quote_sale takes (record_sale takes these plus payments and a note). */
export function saleQuoteArgs(lines: SaleLineInput[], customerId: string | null, options: SaleQuoteOptions = {}) {
  return {
    p_lines: lines.map(toSaleLinePayload),
    p_customer_id: customerId,
    p_ticket: toTicketPayload(options.ticket),
    p_approval_id: options.approvalId ?? null,
  };
}

/** Throws the database error if the quote can't be had. */
export async function fetchSaleQuote(
  lines: SaleLineInput[],
  customerId: string | null,
  options: SaleQuoteOptions = {},
): Promise<SaleQuote> {
  const { data, error } = await supabase.rpc('quote_sale', saleQuoteArgs(lines, customerId, options));
  if (error) throw error;
  return parseSaleQuote(data as QuoteRow);
}

/** Each line's problem as "<line label>: <message>", in ticket order, then the whole ticket's. */
export function quoteProblemMessages(problems: QuoteProblem[], lineLabels: string[]): string[] {
  const lineMessages = problems
    .filter((p): p is QuoteProblem & { line: number } => p.line !== null)
    .sort((a, b) => a.line - b.line)
    .map((p) => `${lineLabels[p.line] ?? `Line ${p.line + 1}`}: ${p.message}`);
  const ticketMessages = problems.filter((p) => p.line === null).map((p) => p.message);
  return [...lineMessages, ...ticketMessages];
}

/**
 * What to tell the cashier when the server's total isn't what the ticket
 * showed (the shop's tax settings changed while it was open), or null when
 * they agree.
 */
export function quoteChangeNotice(shown: SaleTotals, shownTaxRate: number, quote: SaleQuote): string | null {
  if (toCents(shown.total) === toCents(quote.total)) return null;
  const amounts = `the total is $${fromCents(toCents(quote.total)).toFixed(2)}, not $${shown.total.toFixed(2)}`;
  if (quote.taxRate !== shownTaxRate) {
    return `The tax rate is now ${quote.taxRate}% (it was ${shownTaxRate}%), so ${amounts}.`;
  }
  return `The shop's tax settings changed, so ${amounts}.`;
}

/** record_sale refused the payments because they don't add up to its total. */
export function isTotalMismatchError(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('message' in error)) return false;
  return String((error as { message: unknown }).message).includes('must equal the sale total');
}
