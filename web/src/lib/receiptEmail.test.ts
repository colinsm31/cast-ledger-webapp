import { describe, expect, it } from 'vitest';
import type { Receipt } from './receipt';
import { escapeHtml, receiptEmailHtml, receiptEmailText } from './receiptEmail';

const receipt: Receipt = {
  shopName: 'Ace <Racquets>',
  shopAddressLines: ['12 Court St', 'Springfield'],
  number: 'A1B2C3D4',
  soldAt: '2026-11-12T18:30:00Z',
  servedBy: 'sam',
  customer: 'Pat "Ace" Rally',
  lines: [
    { label: 'Wilson Overgrip', qty: 2, unitPrice: 16.5, total: 33, notes: ['$20.00 → $16.50 · 10% off'] },
    { label: '<img src=x onerror=alert(1)>', qty: 1, unitPrice: 50, total: 50, notes: [] },
  ],
  discountTotal: 7,
  ticketDiscountNote: '$3.00 off · Loyalty',
  subtotal: 83,
  taxLabel: 'Tax (8.25%)',
  tax: 5.37,
  total: 88.37,
  payments: [{ label: 'Check #1042', amount: 88.37 }],
  giftCards: [{ label: 'Gift card ••••5432', balance: 50 }],
  refundedTotal: 10,
  returnPolicy: 'Unstrung racquets\nwithin 30 days.',
  footer: 'Thanks & see you!',
};

describe('escapeHtml', () => {
  it('escapes markup and quotes', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('receiptEmailHtml', () => {
  const html = receiptEmailHtml(receipt);

  it('has the letter layout: header, item table, totals, cards, footer', () => {
    expect(html).toContain('Ace &lt;Racquets&gt;');
    expect(html).toContain('Receipt A1B2C3D4');
    expect(html).toContain('Served by sam');
    expect(html).toContain('Customer: Pat &quot;Ace&quot; Rally');
    expect(html).toContain('<th style="padding:4px 0;">Item</th>');
    expect(html).toContain('Wilson Overgrip');
    expect(html).toContain('$20.00 → $16.50 · 10% off');
    expect(html).toContain('You saved (incl. $3.00 off · Loyalty)');
    expect(html).toContain('$88.37');
    expect(html).toContain('Check #1042');
    expect(html).toContain('Refunded since');
    expect(html).toContain('Gift card ••••5432 balance');
    expect(html).toContain('Thanks &amp; see you!');
  });

  it('escapes what staff typed, so nothing runs', () => {
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toMatch(/<\s*script|javascript\s*:/i);
  });

  it('leaves out empty parts', () => {
    const plain = receiptEmailHtml({
      ...receipt,
      shopName: null,
      servedBy: null,
      customer: null,
      discountTotal: 0,
      giftCards: [],
      refundedTotal: 0,
      returnPolicy: null,
      footer: null,
    });
    expect(plain).not.toContain('<h1');
    expect(plain).not.toContain('You saved');
    expect(plain).not.toContain('balance');
    expect(plain).not.toContain('Refunded since');
    expect(plain).not.toContain('border-top:1px solid #000');
  });
});

describe('receiptEmailText', () => {
  it('lays the receipt out in plain text', () => {
    const text = receiptEmailText(receipt);
    expect(text.split('\n').slice(0, 4)).toEqual(['Ace <Racquets>', '12 Court St', 'Springfield', '']);
    expect(text).toContain('  2 × $16.50');
    expect(text).toMatch(/Total +\$88\.37/);
    expect(text).toMatch(/Gift card ••••5432 balance +\$50\.00/);
    expect(text.endsWith('Thanks & see you!')).toBe(true);
  });

  it('works with the fewest parts', () => {
    const text = receiptEmailText({
      ...receipt,
      shopName: null,
      giftCards: [],
      returnPolicy: null,
      footer: null,
      discountTotal: 0,
    });
    expect(text.startsWith('12 Court St')).toBe(true);
    expect(text).not.toContain('balance');
  });
});
