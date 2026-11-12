// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Receipt } from '../../lib/receipt';
import { ReceiptView } from './ReceiptView';

const receipt: Receipt = {
  shopName: 'Ace Racquets',
  shopAddressLines: ['12 Court St', 'Springfield'],
  number: 'A1B2C3D4',
  soldAt: '2026-11-12T18:30:00Z',
  servedBy: 'sam',
  customer: 'Pat Rally',
  lines: [
    { label: 'Wilson Overgrip', qty: 2, unitPrice: 16.5, total: 33, notes: ['$20.00 → $16.50 · 10% off · Promotion'] },
  ],
  discountTotal: 7,
  ticketDiscountNote: '$3.00 off the ticket · Loyalty',
  subtotal: 33,
  taxLabel: 'Tax (8.25%)',
  tax: 2.72,
  total: 35.72,
  payments: [{ label: 'Cash', amount: 35.72 }],
  giftCards: [{ label: 'Gift card ••••2222', balance: 10 }],
  refundedTotal: 0,
  returnPolicy: 'Unstrung racquets within 30 days.',
  footer: 'Thanks for playing!',
};

afterEach(cleanup);

describe('ReceiptView', () => {
  for (const layout of ['thermal', 'letter'] as const) {
    it(`prints everything on the ${layout} layout`, () => {
      render(<ReceiptView receipt={receipt} layout={layout} />);
      const text = screen.getByRole('article', { name: 'Receipt' }).textContent ?? '';
      for (const expected of [
        'Ace Racquets',
        'Springfield',
        'Receipt A1B2C3D4',
        'Served by sam',
        'Customer: Pat Rally',
        'Wilson Overgrip',
        '$20.00 → $16.50 · 10% off · Promotion',
        'You saved (incl. $3.00 off the ticket · Loyalty)',
        'Tax (8.25%)',
        '$35.72',
        'Gift card ••••2222 balance',
        'Unstrung racquets within 30 days.',
        'Thanks for playing!',
      ]) {
        expect(text).toContain(expected);
      }
    });
  }

  it('leaves out what the sale and the shop don’t have', () => {
    render(
      <ReceiptView
        receipt={{
          ...receipt,
          shopName: null,
          customer: null,
          discountTotal: 0,
          giftCards: [],
          returnPolicy: null,
          footer: null,
          refundedTotal: 5,
        }}
        layout="thermal"
      />,
    );
    const text = screen.getByRole('article', { name: 'Receipt' }).textContent ?? '';
    expect(text).not.toContain('Customer:');
    expect(text).not.toContain('You saved');
    expect(text).not.toContain('balance');
    expect(text).toContain('Refunded since');
  });
});
