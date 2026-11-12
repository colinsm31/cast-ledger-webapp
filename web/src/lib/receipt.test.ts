import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
const { buildReceipt, receiptNumber, servedByName } = await import('./receipt');
type ReceiptSaleRow = import('./receipt').ReceiptSaleRow;

const plainLine = {
  qty: 1,
  unit_price: '20.00',
  price_before_discount: null,
  line_discount: null,
  ticket_discount_each: null,
  discount_reason: null,
  kind: 'charge' as const,
  gift_card_id: null,
  products: { brand: 'Wilson', name: 'Overgrip', attributes: { color: 'White' } },
  gift_cards: null,
};

const sale: ReceiptSaleRow = {
  id: 'a1b2c3d4-0000-0000-0000-000000000000',
  sold_at: '2026-11-12T18:30:00Z',
  subtotal: '83.00',
  tax: '5.37',
  tax_rate: '8.250',
  tax_exempt_id: null,
  ticket_discount: '3.0000',
  ticket_discount_reason: 'Loyalty',
  customers: { first_name: 'Pat', last_name: 'Rally' },
  rung_by: { email: 'sam@shop.test' },
  sale_lines: [
    {
      ...plainLine,
      qty: 2,
      unit_price: '16.50',
      price_before_discount: '20.00',
      line_discount: '0.1000',
      ticket_discount_each: '1.50',
      discount_reason: 'Promotion',
    },
    { ...plainLine, unit_price: '50.00', products: null, gift_card_id: 'g-new', gift_cards: { code: 'GC-98765432' } },
  ],
  sale_payments: [
    { method: 'gift_card', amount: '40.00', check_number: null, gift_card_id: 'g-old' },
    { method: 'check', amount: '48.37', check_number: '1042', gift_card_id: null },
  ],
  refunds: [],
};

const shop = {
  shop_name: 'Ace Racquets',
  shop_address: '12 Court St\n\n Springfield · (555) 123-4567 ',
  return_policy: 'Unstrung racquets within 30 days.',
  receipt_footer: 'Thanks for playing!',
};

const cards = new Map([
  ['g-old', { code: 'GC-11112222', balance: 10 }],
  ['g-new', { code: 'GC-98765432', balance: 50 }],
]);

describe('buildReceipt', () => {
  const receipt = buildReceipt(sale, shop, cards);

  it('heads the receipt with the shop, the sale number, who served and the customer', () => {
    expect(receipt).toMatchObject({
      shopName: 'Ace Racquets',
      shopAddressLines: ['12 Court St', 'Springfield · (555) 123-4567'],
      number: 'A1B2C3D4',
      servedBy: 'sam',
      customer: 'Pat Rally',
    });
  });

  it('lists each line at what it finally cost, with its discount, and hides gift card codes', () => {
    expect(receipt.lines).toEqual([
      {
        label: 'Wilson Overgrip White',
        qty: 2,
        unitPrice: 16.5,
        total: 33,
        notes: ['$20.00 → $16.50 · 10% off · Promotion + ticket discount'],
      },
      { label: 'Gift card ••••5432', qty: 1, unitPrice: 50, total: 50, notes: [] },
    ]);
  });

  it('totals discounts, tax and payments, and shows what each gift card has left', () => {
    expect(receipt).toMatchObject({
      discountTotal: 7,
      ticketDiscountNote: '$3.00 off the ticket · Loyalty',
      subtotal: 83,
      taxLabel: 'Tax (8.25%)',
      tax: 5.37,
      total: 88.37,
      payments: [
        { label: 'Gift card ••••2222', amount: 40 },
        { label: 'Check #1042', amount: 48.37 },
      ],
      giftCards: [
        { label: 'Gift card ••••5432', balance: 50 },
        { label: 'Gift card ••••2222', balance: 10 },
      ],
      refundedTotal: 0,
      returnPolicy: 'Unstrung racquets within 30 days.',
      footer: 'Thanks for playing!',
    });
  });

  it('names a tax exemption, and adds up refunds', () => {
    const exempt = buildReceipt(
      { ...sale, tax: '0', tax_rate: '0', tax_exempt_id: 'TX-555', refunds: [{ subtotal: '16.50', tax: '0' }] },
      { shop_name: null, shop_address: null, return_policy: null, receipt_footer: null },
      new Map(),
    );
    expect(exempt).toMatchObject({ taxLabel: 'Tax exempt · TX-555', tax: 0, total: 83, refundedTotal: 16.5 });
    expect(exempt.shopAddressLines).toEqual([]);
    expect(exempt.giftCards).toEqual([]);
    expect(exempt.payments[0].label).toBe('Gift Card');
  });
});

describe('receiptNumber and servedByName', () => {
  it('shortens the id and the email', () => {
    expect(receiptNumber('0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0')).toBe('0F1E2D3C');
    expect(servedByName({ email: 'pat.lee@shop.test' })).toBe('pat.lee');
    expect(servedByName(null)).toBeNull();
  });
});
