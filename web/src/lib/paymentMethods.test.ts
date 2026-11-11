import { describe, expect, it } from 'vitest';
import { normalizeCheckNumber, paymentLabel, refundMethodsFor, saleMethodsFor } from './paymentMethods';

describe('saleMethodsFor', () => {
  it('offers checks only when the shop takes them', () => {
    expect(saleMethodsFor(false)).toEqual(['cash', 'credit', 'gift_card', 'store_credit']);
    expect(saleMethodsFor(true)).toEqual(['cash', 'credit', 'gift_card', 'store_credit', 'check']);
  });
});

describe('refundMethodsFor', () => {
  it('offers a refund check when the shop takes checks', () => {
    expect(refundMethodsFor(true, false)).toContain('check');
  });

  it('or when the sale was paid by check, even with checks off', () => {
    expect(refundMethodsFor(false, true)).toContain('check');
  });

  it('not otherwise', () => {
    expect(refundMethodsFor(false, false)).toEqual(['cash', 'credit', 'store_credit', 'gift_card']);
  });
});

describe('normalizeCheckNumber', () => {
  it('trims a number of 1 to 10 digits', () => {
    expect(normalizeCheckNumber(' 1042 ')).toBe('1042');
    expect(normalizeCheckNumber('1234567890')).toBe('1234567890');
  });

  it('refuses blanks, other characters and more than 10 digits', () => {
    expect(normalizeCheckNumber('')).toBeNull();
    expect(normalizeCheckNumber('10-42')).toBeNull();
    expect(normalizeCheckNumber('#1042')).toBeNull();
    expect(normalizeCheckNumber('12345678901')).toBeNull();
  });
});

describe('paymentLabel', () => {
  it('shows a check with its number', () => {
    expect(paymentLabel('check', '1042')).toBe('Check #1042');
    expect(paymentLabel('check', null)).toBe('Check');
  });

  it('labels the other types, ignoring a number', () => {
    expect(paymentLabel('store_credit')).toBe('Store Credit');
    expect(paymentLabel('cash', '9')).toBe('Cash');
  });

  it('falls back to the raw type', () => {
    expect(paymentLabel('split')).toBe('split');
  });
});
