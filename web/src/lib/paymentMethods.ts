// Payment types: their labels, which ones the shop offers, and the check
// number rule (the same as the database's require_check_number).
import type { PaymentMethod } from '../types/domain';

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  credit: 'Credit',
  gift_card: 'Gift Card',
  store_credit: 'Store Credit',
  check: 'Check',
};

/** The payment screen's types, in button order: checks only when the shop takes them. */
export function saleMethodsFor(acceptChecks: boolean): PaymentMethod[] {
  const methods: PaymentMethod[] = ['cash', 'credit', 'gift_card', 'store_credit'];
  return acceptChecks ? [...methods, 'check'] : methods;
}

/**
 * The refund screen's types. A refund check is offered while the shop takes
 * checks, or when the sale was paid by check (the server allows both).
 */
export function refundMethodsFor(acceptChecks: boolean, salePaidByCheck: boolean): PaymentMethod[] {
  const methods: PaymentMethod[] = ['cash', 'credit', 'store_credit', 'gift_card'];
  return acceptChecks || salePaidByCheck ? [...methods, 'check'] : methods;
}

/** A tender as record_sale, record_refund and record_exchange take it. */
export function toPaymentPayload(tender: {
  method: PaymentMethod;
  amount: number;
  giftCardId?: string;
  checkNumber?: string;
}) {
  return {
    method: tender.method,
    amount: tender.amount,
    gift_card_id: tender.giftCardId ?? null,
    check_number: tender.checkNumber ?? null,
  };
}

export const CHECK_NUMBER_MESSAGE = 'Enter the check number (digits only, up to 10).';

/** The trimmed check number, or null when it isn't 1–10 digits. */
export function normalizeCheckNumber(raw: string): string | null {
  const trimmed = raw.trim();
  return /^[0-9]{1,10}$/.test(trimmed) ? trimmed : null;
}

/**
 * A saved payment or refund that only an exchange writes (0077): the returned
 * items' value moving to the new sale. It isn't offered as a payment type.
 */
export const EXCHANGE_METHOD = 'exchange';
const EXCHANGE_LABEL = 'Exchange credit';

/** "Cash", "Check #1042", "Exchange credit" — a saved payment or refund, for display. */
export function paymentLabel(method: string, checkNumber?: string | null): string {
  if (method === EXCHANGE_METHOD) return EXCHANGE_LABEL;
  const label = PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method;
  return method === 'check' && checkNumber ? `${label} #${checkNumber}` : label;
}
