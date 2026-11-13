// A sale's receipt: everything the printed layouts show, worked out once from
// the saved sale, the shop's receipt settings (0059) and the balance left on
// any gift card the sale used or loaded.
import { supabase } from './supabase';
import { errorMessage } from './errors';
import { fetchSettings, type Settings } from './settings';
import { fromCents, toCents } from './saleMath';
import { paymentLabel } from './paymentMethods';
import { maskGiftCardCode, saleLineLabel, type SaleLineNameSource } from './saleLines';
import { savedDiscountCents, savedDiscountNote, savedTicketDiscountNote, type SavedDiscountLine } from './discounts';
import { customerName } from '../types/domain';
import type { StaffRef } from './staff';

/** The sale as fetchReceipt reads it. */
export interface ReceiptSaleRow {
  id: string;
  sold_at: string;
  subtotal: number | string;
  tax: number | string;
  tax_rate: number | string | null;
  tax_exempt_id: string | null;
  ticket_discount: number | string | null;
  ticket_discount_reason: string | null;
  customers: { first_name: string; last_name: string } | null;
  rung_by: StaffRef | null;
  sale_lines: (SaleLineNameSource & SavedDiscountLine & { qty: number; gift_card_id: string | null })[];
  sale_payments: {
    method: string;
    amount: number | string;
    check_number: string | null;
    gift_card_id: string | null;
  }[];
  refunds: { subtotal: number | string; tax: number | string }[];
}

export type ReceiptShop = Pick<Settings, 'shop_name' | 'shop_address' | 'return_policy' | 'receipt_footer'>;

export interface ReceiptLine {
  label: string;
  qty: number;
  /** What each item cost, after discounts. */
  unitPrice: number;
  total: number;
  /** e.g. the discount: "$20.00 → $16.50 · 10% off · Promotion". */
  notes: string[];
}

export interface Receipt {
  shopName: string | null;
  shopAddressLines: string[];
  /** A short sale number to quote for returns. */
  number: string;
  soldAt: string;
  servedBy: string | null;
  customer: string | null;
  lines: ReceiptLine[];
  discountTotal: number;
  ticketDiscountNote: string | null;
  subtotal: number;
  taxLabel: string;
  tax: number;
  total: number;
  payments: { label: string; amount: number }[];
  /** Balance left on each gift card the sale used or loaded. */
  giftCards: { label: string; balance: number }[];
  refundedTotal: number;
  returnPolicy: string | null;
  footer: string | null;
}

const money = (amount: number | string) => fromCents(toCents(amount));

/** The first 8 characters of the sale's id, which find it again for a return. */
export function receiptNumber(saleId: string): string {
  return saleId.replace(/-/g, '').slice(0, 8).toUpperCase();
}

/** The part of a staff email before the @, so the receipt doesn't print an address. */
export function servedByName(staff: StaffRef | null): string | null {
  const email = staff?.email?.trim();
  return email ? email.split('@')[0] : null;
}

export function buildReceipt(
  sale: ReceiptSaleRow,
  shop: ReceiptShop,
  /** Gift card id → its code and the balance left on it now. */
  giftCards: Map<string, { code: string; balance: number }>,
): Receipt {
  const lines = sale.sale_lines.map((line) => {
    const note = savedDiscountNote(line);
    return {
      label: line.gift_cards ? `Gift card ${maskGiftCardCode(line.gift_cards.code)}` : saleLineLabel(line),
      qty: line.qty,
      unitPrice: money(line.unit_price),
      total: fromCents(line.qty * toCents(line.unit_price)),
      notes: note ? [note] : [],
    };
  });

  // Each gift card once, in the order the sale touched it: loads, then payments.
  const usedCardIds = [
    ...sale.sale_lines.map((line) => line.gift_card_id),
    ...sale.sale_payments.map((payment) => payment.gift_card_id),
  ].filter((id, index, ids): id is string => id != null && ids.indexOf(id) === index);

  const taxRate = Number(sale.tax_rate ?? 0);
  const tax = money(sale.tax);
  const subtotal = money(sale.subtotal);
  return {
    shopName: shop.shop_name,
    shopAddressLines: (shop.shop_address ?? '').split('\n').map((line) => line.trim()).filter(Boolean),
    number: receiptNumber(sale.id),
    soldAt: sale.sold_at,
    servedBy: servedByName(sale.rung_by),
    customer: sale.customers ? customerName(sale.customers) : null,
    lines,
    discountTotal: fromCents(savedDiscountCents(sale.sale_lines)),
    ticketDiscountNote: savedTicketDiscountNote(sale.ticket_discount, sale.ticket_discount_reason),
    subtotal,
    taxLabel: sale.tax_exempt_id ? `Tax exempt · ${sale.tax_exempt_id}` : `Tax (${taxRate}%)`,
    tax,
    total: fromCents(toCents(subtotal) + toCents(tax)),
    payments: sale.sale_payments.map((payment) => {
      const card = payment.gift_card_id ? giftCards.get(payment.gift_card_id) : undefined;
      return {
        label: card ? `Gift card ${maskGiftCardCode(card.code)}` : paymentLabel(payment.method, payment.check_number),
        amount: money(payment.amount),
      };
    }),
    giftCards: usedCardIds
      .map((id) => giftCards.get(id))
      .filter((card): card is { code: string; balance: number } => card !== undefined)
      .map((card) => ({ label: `Gift card ${maskGiftCardCode(card.code)}`, balance: money(card.balance) })),
    refundedTotal: fromCents(
      sale.refunds.reduce((sum, refund) => sum + toCents(refund.subtotal) + toCents(refund.tax), 0),
    ),
    returnPolicy: shop.return_policy,
    footer: shop.receipt_footer,
  };
}

const RECEIPT_SELECT = [
  'id, sold_at, subtotal, tax, tax_rate, tax_exempt_id, ticket_discount, ticket_discount_reason',
  'customers ( first_name, last_name )',
  'rung_by:profiles!sales_user_id_fkey ( email )',
  'sale_lines ( qty, unit_price, price_before_discount, line_discount, ticket_discount_each, discount_reason, kind, gift_card_id, products ( brand, name, attributes ), gift_cards ( code ) )',
  'sale_payments ( method, amount, check_number, gift_card_id )',
  'refunds ( subtotal, tax )',
].join(', ');

/** The receipt for a saved sale; throws a message worded for the cashier. */
export async function fetchReceipt(saleId: string): Promise<Receipt> {
  const [saleRes, settings] = await Promise.all([
    supabase.from('sales').select(RECEIPT_SELECT).eq('id', saleId).single(),
    fetchSettings(),
  ]);
  if (saleRes.error) throw new Error(`Couldn't load the sale: ${errorMessage(saleRes.error)}`);
  const sale = saleRes.data as unknown as ReceiptSaleRow;
  const cardIds = [
    ...sale.sale_lines.map((line) => line.gift_card_id),
    ...sale.sale_payments.map((payment) => payment.gift_card_id),
  ].filter((id): id is string => id != null);
  const giftCards = new Map<string, { code: string; balance: number }>();
  if (cardIds.length > 0) {
    const { data, error } = await supabase
      .from('gift_card_balance')
      .select('gift_card_id, code, balance')
      .in('gift_card_id', cardIds);
    if (error) throw new Error(`Couldn't load the gift card balances: ${errorMessage(error)}`);
    for (const row of (data ?? []) as { gift_card_id: string; code: string; balance: number | string }[]) {
      giftCards.set(row.gift_card_id, { code: row.code, balance: Number(row.balance) });
    }
  }
  return buildReceipt(sale, settings, giftCards);
}
