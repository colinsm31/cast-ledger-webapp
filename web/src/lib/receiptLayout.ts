// The two printed receipt layouts: an 80 mm thermal roll and a letter page.
// The layout last printed on this device is remembered, since each register
// has one kind of printer.

export type ReceiptLayout = 'thermal' | 'letter';

export const RECEIPT_LAYOUTS: { value: ReceiptLayout; label: string }[] = [
  { value: 'thermal', label: '80 mm receipt' },
  { value: 'letter', label: 'Letter page' },
];

const STORAGE_KEY = 'acestock.receiptLayout';

function isLayout(value: unknown): value is ReceiptLayout {
  return value === 'thermal' || value === 'letter';
}

/** The layout asked for in the address, else this device's last, else thermal. */
export function chooseLayout(requested: string | null, remembered: string | null): ReceiptLayout {
  if (isLayout(requested)) return requested;
  if (isLayout(remembered)) return remembered;
  return 'thermal';
}

export function rememberedLayout(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberLayout(layout: ReceiptLayout) {
  try {
    localStorage.setItem(STORAGE_KEY, layout);
  } catch {
    // A private window or blocked storage just means no default next time.
  }
}

/** The printed page's size and margins, for an @page rule. */
export function pageRule(layout: ReceiptLayout): string {
  return layout === 'thermal' ? '@page { size: 80mm auto; margin: 3mm; }' : '@page { size: letter; margin: 0.6in; }';
}
