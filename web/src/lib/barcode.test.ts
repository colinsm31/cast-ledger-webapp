import { describe, expect, it } from 'vitest';
import { looksLikeBarcode, normalizeBarcode } from './barcode';

describe('normalizeBarcode', () => {
  it('strips every kind of whitespace', () => {
    expect(normalizeBarcode(' 0123 4567\t8905\n')).toBe('012345678905');
  });

  it('leaves letters and punctuation alone', () => {
    expect(normalizeBarcode('RQ-UNIT-1')).toBe('RQ-UNIT-1');
  });
});

describe('looksLikeBarcode', () => {
  it('treats all-digit input (spaces allowed) as a scanned code', () => {
    expect(looksLikeBarcode('012345678905')).toBe(true);
    expect(looksLikeBarcode('0123 4567 8905')).toBe(true);
  });

  it('treats anything with letters or punctuation as a search term', () => {
    expect(looksLikeBarcode('Smith')).toBe(false);
    expect(looksLikeBarcode('(225)555-0100')).toBe(false);
  });

  it('is false for blank input', () => {
    expect(looksLikeBarcode('')).toBe(false);
    expect(looksLikeBarcode('   ')).toBe(false);
  });
});
