// Tax-exempt customers (0058): a sale to one charges no tax and keeps the
// exemption ID. Only an admin can set or change a customer's exemption.

export const TAX_EXEMPT_ID_MAX_LENGTH = 50;

export interface TaxExemption {
  tax_exempt: boolean;
  tax_exempt_id: string | null;
}

/** The exemption to save from the form, or what's wrong with it. */
export function parseTaxExemption(exempt: boolean, id: string): TaxExemption | { error: string } {
  if (!exempt) return { tax_exempt: false, tax_exempt_id: null };
  const trimmed = id.trim();
  if (!trimmed) return { error: 'Tax exempt: enter the exemption certificate number.' };
  if (trimmed.length > TAX_EXEMPT_ID_MAX_LENGTH) {
    return { error: `Tax exempt: the certificate number can be at most ${TAX_EXEMPT_ID_MAX_LENGTH} characters.` };
  }
  return { tax_exempt: true, tax_exempt_id: trimmed };
}

/** Whether saving would change the customer's exemption (only admins may). */
export function exemptionChanged(saved: Partial<TaxExemption>, next: TaxExemption): boolean {
  return Boolean(saved.tax_exempt) !== next.tax_exempt || (saved.tax_exempt_id ?? null) !== next.tax_exempt_id;
}

/** "Tax exempt · TX-123" for a tax-exempt customer, else null. */
export function taxExemptLabel(customer: Partial<TaxExemption> | null | undefined): string | null {
  if (!customer?.tax_exempt) return null;
  return customer.tax_exempt_id ? `Tax exempt · ${customer.tax_exempt_id}` : 'Tax exempt';
}

/** The rate the register charges this customer: none when they're tax-exempt. */
export function taxRateFor(shopRate: number, customer: Partial<TaxExemption> | null | undefined): number {
  return customer?.tax_exempt ? 0 : shopRate;
}
