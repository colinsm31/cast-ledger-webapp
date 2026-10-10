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
