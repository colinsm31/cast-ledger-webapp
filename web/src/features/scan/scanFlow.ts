// Query-string contract for the scan-to-find-or-create flow. Screens that hand
// a scanned code to one another go through these helpers so the param names
// live in exactly one place.

// MARK: - Constants

export const ScanFlowParams = {
  /** A scanned code that should be assigned to a customer's racket. */
  racketBarcode: 'racketBarcode',
  /** A scanned code to sell as a new gift card on the POS. */
  giftCardCode: 'giftCardCode',
  /** Where to go after a form saves (instead of the form's default destination). */
  returnTo: 'returnTo',
  /** Id of a product to add to the sales ticket on arrival (from a scan or a just-created product). */
  addProduct: 'addProduct',
  /** Id of a serialized unit (specific racket) to add to the sales ticket on arrival. */
  addUnit: 'addUnit',
  /** Flag shown once on a product page right after it was created. */
  created: 'created',
  /** Open the receive-units sheet on arrival (serialized product scanned to receive). */
  receiveUnits: 'receive',
} as const;

// MARK: - Helpers

/** Append non-empty params to a path that may or may not already have a query string. */
export function withParams(path: string, params: Record<string, string | null | undefined>): string {
  const [base, existing = ''] = path.split('?');
  const query = new URLSearchParams(existing);
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const encoded = query.toString();
  return encoded ? `${base}?${encoded}` : base;
}

/** Open the POS with this product on the ticket (starts one, or adds to the held sale). */
export function sellProductPath(productId: string): string {
  return withParams('/sales/new', { [ScanFlowParams.addProduct]: productId });
}

/** Open the POS with this specific serialized unit (racket) on the ticket. */
export function sellUnitPath(unitId: string): string {
  return withParams('/sales/new', { [ScanFlowParams.addUnit]: unitId });
}

/**
 * Only allow in-app paths as a return target so a crafted link can't bounce
 * the user to another site.
 */
export function safeReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}
