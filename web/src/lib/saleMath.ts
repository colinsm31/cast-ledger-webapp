// Register money math. Mirrors record_sale in the database so the total shown
// at the register is exactly the total the server will require payment for.
//
// Everything is computed in whole cents. Floating-point dollars round wrongly
// at some half-cent boundaries (e.g. $102 × 8.25% = 8.415 came out as 8.41
// while the database charges 8.42), which made the register ask for a cent
// less than record_sale requires and the sale was rejected.

export interface PricedLine {
  qty: number;
  /** Unit price as typed at the register (string) or stored (number). */
  price: string | number;
  stringJobId?: string;
  giftCardId?: string;
}

export interface TaxRules {
  /** Percent, e.g. 8.25. Stored with up to 3 decimals. */
  taxRate: number;
  /** Whether stringing (string-job lines) is taxable. */
  taxStringing: boolean;
}

export interface SaleTotals {
  subtotal: number;
  tax: number;
  total: number;
}

/** Whole cents for a dollar amount; non-numeric input counts as 0. */
export function toCents(amount: string | number): number {
  const value = Number(amount);
  return Number.isFinite(value) ? Math.round(value * 100) : 0;
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** Round a dollar amount to the cent. */
export function roundMoney(amount: number): number {
  return fromCents(toCents(amount));
}

export function lineTotalCents(line: PricedLine): number {
  return line.qty * toCents(line.price);
}

/** Products are taxed; stringing only when enabled; gift card loads never. */
export function isTaxable(line: PricedLine, rules: TaxRules): boolean {
  if (line.giftCardId) return false;
  if (line.stringJobId) return rules.taxStringing;
  return true;
}

/**
 * Tax in cents on a taxable amount, rounded half up like Postgres
 * `round(numeric, 2)`. The rate is scaled to an integer (thousandths of a
 * percent) so the whole calculation stays in exact integer arithmetic.
 */
export function taxCents(taxableCents: number, taxRatePercent: number): number {
  const rateThousandths = Math.round(taxRatePercent * 1000);
  const scaled = taxableCents * rateThousandths; // cents × percent × 1000
  return Math.floor((scaled + 50_000) / 100_000);
}

export function computeSaleTotals(lines: PricedLine[], rules: TaxRules): SaleTotals {
  let subtotalCents = 0;
  let taxableCents = 0;
  for (const line of lines) {
    const cents = lineTotalCents(line);
    subtotalCents += cents;
    if (isTaxable(line, rules)) taxableCents += cents;
  }
  const tax = taxCents(taxableCents, rules.taxRate);
  return {
    subtotal: fromCents(subtotalCents),
    tax: fromCents(tax),
    total: fromCents(subtotalCents + tax),
  };
}

// MARK: - Refunds (mirror record_refund)

export interface RefundTaxInput {
  /** Subtotal and tax of earlier refunds of the same sale, in cents. */
  previousSubtotalCents: number;
  previousTaxCents: number;
  /** Tax the original sale charged, in cents. */
  saleTaxCents: number;
  /** Subtotal of the refund being built, in cents. */
  refundSubtotalCents: number;
  /** The rate the sale was charged at (percent). */
  taxRate: number;
}

/**
 * Tax for a refund: tax on everything refunded so far (rounded once), minus
 * tax already refunded, never beyond what the sale charged. Refunding items one
 * at a time therefore gives back exactly the tax the sale charged.
 */
export function refundTaxCents(input: RefundTaxInput): number {
  const cumulative = taxCents(input.previousSubtotalCents + input.refundSubtotalCents, input.taxRate);
  return Math.max(0, Math.min(cumulative, input.saleTaxCents) - input.previousTaxCents);
}

export interface MethodAmount<M extends string> {
  method: M;
  /** Dollars. */
  amount: number;
}

/** Dollars per payment method, summed and kept in whole cents. */
export function centsByMethod<M extends string>(amounts: MethodAmount<M>[]): Map<M, number> {
  const totals = new Map<M, number>();
  for (const { method, amount } of amounts) {
    totals.set(method, (totals.get(method) ?? 0) + toCents(amount));
  }
  return totals;
}

/**
 * What a refund is limited by: its payment type, or for a gift card, the card
 * itself, so money goes back to the card that paid (record_refund, 0046).
 */
export function refundSource(method: string, giftCardId?: string | null): string {
  return method === 'gift_card' && giftCardId ? `gift_card:${giftCardId}` : method;
}

/**
 * How much each payment type can still give back without a payment-type
 * change: what the sale took that way minus what earlier refunds returned that way.
 */
export function refundableByMethod<M extends string>(
  salePayments: MethodAmount<M>[],
  earlierRefundPayments: MethodAmount<M>[],
): Map<M, number> {
  const taken = centsByMethod(salePayments);
  const givenBack = centsByMethod(earlierRefundPayments);
  const refundable = new Map<M, number>();
  for (const [method, cents] of taken) {
    refundable.set(method, Math.max(0, cents - (givenBack.get(method) ?? 0)));
  }
  return refundable;
}

/** Payment types this refund sends more to than they can give back. */
export function paymentTypeChanges<M extends string>(
  refundable: Map<M, number>,
  tenders: MethodAmount<M>[],
): M[] {
  const changes: M[] = [];
  for (const [method, cents] of centsByMethod(tenders)) {
    if (cents > (refundable.get(method) ?? 0)) changes.push(method);
  }
  return changes;
}

/**
 * Split a refund total back across the payment types the sale used, in their
 * original order, up to what each can still give back. Whatever is left over
 * (nothing, unless earlier refunds already used other types) is returned as
 * `unallocatedCents` for the cashier to place.
 */
export function allocateToOriginalPayments<P extends MethodAmount<string>>(
  totalCents: number,
  salePayments: P[],
  refundable: Map<string, number>,
  /** The key `refundable` uses for a payment; its method unless given. */
  sourceOf: (payment: P) => string = (payment) => payment.method,
): { allocations: { payment: P; cents: number }[]; unallocatedCents: number } {
  const remainingByMethod = new Map(refundable);
  const allocations: { payment: P; cents: number }[] = [];
  let left = totalCents;
  for (const payment of salePayments) {
    if (left <= 0) break;
    const source = sourceOf(payment);
    const available = Math.min(toCents(payment.amount), remainingByMethod.get(source) ?? 0);
    const cents = Math.min(available, left);
    if (cents <= 0) continue;
    allocations.push({ payment, cents });
    remainingByMethod.set(source, (remainingByMethod.get(source) ?? 0) - cents);
    left -= cents;
  }
  return { allocations, unallocatedCents: left };
}
