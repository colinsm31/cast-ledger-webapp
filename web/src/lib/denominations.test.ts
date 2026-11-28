import { describe, expect, it } from 'vitest';
import { countTotal, emptyCount, hasCountStarted, parseCount } from './denominations';

describe('parseCount', () => {
  it('adds up bills, coins and other cash, skipping empty boxes', () => {
    const form = { ...emptyCount(), '20': '3', '5': '2', '1': '4', '0.25': '3', '0.01': '2', other: '10.50' };
    expect(parseCount(form)).toEqual({
      counts: { '20': 3, '5': 2, '1': 4, '0.25': 3, '0.01': 2, other: 10.5 },
      total: 85.27,
    });
  });

  it('counts an empty drawer as $0', () => {
    expect(parseCount(emptyCount())).toEqual({ counts: {}, total: 0 });
  });

  it('refuses part of a bill, a word, a negative count, or other cash with a fraction of a cent', () => {
    expect(parseCount({ ...emptyCount(), '20': '1.5' })).toEqual({ error: '$20: enter a whole number, like 3.' });
    expect(parseCount({ ...emptyCount(), '0.10': 'ten' })).toEqual({ error: '10¢: enter a number, like 3.' });
    expect(parseCount({ ...emptyCount(), '5': '-2' })).toEqual({ error: "$5 can't be negative." });
    expect(parseCount({ ...emptyCount(), other: '$5' })).toEqual({ error: 'Other cash: enter a number, like 52 or 52.5.' });
    expect(parseCount({ ...emptyCount(), other: '1.005' })).toEqual({ error: 'Other cash: use at most 2 decimal places.' });
  });

  it('refuses a count too large to store', () => {
    expect(parseCount({ ...emptyCount(), '100': '20000' })).toEqual({ error: 'That count is too large.' });
  });

  it('knows whether counting has started', () => {
    expect(hasCountStarted(emptyCount())).toBe(false);
    expect(hasCountStarted({ ...emptyCount(), '0.01': '0' })).toBe(true);
  });

  it('gives no running total while a box is wrong', () => {
    expect(countTotal({ ...emptyCount(), '10': '2' })).toBe(20);
    expect(countTotal({ ...emptyCount(), '10': 'x' })).toBeNull();
  });
});
