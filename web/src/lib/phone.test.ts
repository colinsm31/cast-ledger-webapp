import { describe, expect, it } from 'vitest';
import { formatPhone } from './phone';

describe('formatPhone', () => {
  it('formats a full ten-digit number', () => {
    expect(formatPhone('2255550100')).toBe('(225)555-0100');
  });

  it('lays out partial input progressively', () => {
    expect(formatPhone('2')).toBe('(2');
    expect(formatPhone('2255')).toBe('(225)5');
    expect(formatPhone('2255550')).toBe('(225)555-0');
  });

  it('ignores non-digits and anything past ten digits', () => {
    expect(formatPhone('(225) 555-0100 ext 9')).toBe('(225)555-0100');
  });

  it('is empty when there are no digits', () => {
    expect(formatPhone('abc')).toBe('');
  });
});
