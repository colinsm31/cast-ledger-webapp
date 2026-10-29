import { describe, expect, it } from 'vitest';
import { firstNumberProblem, parseNumberField } from './numberInput';

describe('parseNumberField', () => {
  it('reads a typed number, and an empty field as null', () => {
    expect(parseNumberField(' 52.5 ', 'Tension')).toEqual({ value: 52.5 });
    expect(parseNumberField('.5', 'Tension')).toEqual({ value: 0.5 });
    expect(parseNumberField('', 'Tension')).toEqual({ value: null });
  });

  it('refuses a typo instead of treating it as empty', () => {
    for (const typo of ['52lb', 'abc', '1e3', '5,5', '--2']) {
      expect(parseNumberField(typo, 'Tension')).toEqual({ error: 'Tension: enter a number, like 52 or 52.5.' });
    }
  });

  it('refuses a negative number unless allowed', () => {
    expect(parseNumberField('-1', 'Price')).toEqual({ error: "Price can't be negative." });
    expect(parseNumberField('-1.5', 'Quantity', 'halves', { allowNegative: true })).toEqual({ value: -1.5 });
  });

  it('checks whole numbers and halves', () => {
    expect(parseNumberField('3', 'Reorder point', 'whole')).toEqual({ value: 3 });
    expect(parseNumberField('2.5', 'Reorder point', 'whole')).toEqual({
      error: 'Reorder point: enter a whole number, like 3.',
    });
    expect(parseNumberField('2.5', 'Quantity', 'halves')).toEqual({ value: 2.5 });
    for (const odd of ['1.37', '0.0001', '2.25']) {
      expect(parseNumberField(odd, 'Quantity', 'halves')).toEqual({
        error: 'Quantity: use whole or half units, like 2 or 2.5.',
      });
    }
  });
});

describe('firstNumberProblem', () => {
  it('returns the first error, or null', () => {
    expect(firstNumberProblem({ value: 1 }, { error: 'A' }, { error: 'B' })).toBe('A');
    expect(firstNumberProblem({ value: 1 }, { value: null })).toBeNull();
  });
});
