import { describe, expect, it } from 'vitest';
import { hasSubCent, subCentError } from './money';

describe('hasSubCent', () => {
  it('flags a fraction of a cent', () => {
    expect(hasSubCent('3.334')).toBe(true);
    expect(hasSubCent('10.005')).toBe(true);
    expect(hasSubCent('-1.001')).toBe(true);
    expect(hasSubCent(' 0.0001 ')).toBe(true);
  });

  it('allows whole cents, trailing zeros and non-numbers', () => {
    for (const ok of ['', '12', '12.5', '12.50', '12.500', '-5.00', '.5', 'abc']) {
      expect(hasSubCent(ok)).toBe(false);
    }
  });
});

describe('subCentError', () => {
  it('names the first field with a fraction of a cent', () => {
    expect(subCentError({ 'Sell price': '10.00', Cost: '4.125' })).toBe('Cost: use at most 2 decimal places.');
    expect(subCentError({ 'Sell price': '10.00', Cost: '' })).toBeNull();
  });
});
