import { describe, expect, it } from 'vitest';
import { formatPhone } from './phone';

describe('formatPhone', () => {
  it('formats a full ten-digit number', () => {
    expect(formatPhone('2255550100')).toBe('(225)555-0100');
    expect(formatPhone('(225) 555-0100')).toBe('(225)555-0100');
  });

  it('lays out partial input progressively', () => {
    expect(formatPhone('2')).toBe('(2');
    expect(formatPhone('2255')).toBe('(225)5');
    expect(formatPhone('2255550')).toBe('(225)555-0');
  });

  it('drops a leading +1 or 1 rather than reading it as the area code', () => {
    expect(formatPhone('+1 225 555 0100')).toBe('(225)555-0100');
    expect(formatPhone('1-225-555-0100')).toBe('(225)555-0100');
    expect(formatPhone('12255550100')).toBe('(225)555-0100');
  });

  it('keeps an international number or an extension as typed, not cut short', () => {
    expect(formatPhone('+44 20 7946 0958')).toBe('+44 20 7946 0958');
    expect(formatPhone('(225)555-0100 x9')).toBe('(225)555-0100 x9');
  });

  it('is empty when there are no digits', () => {
    expect(formatPhone('abc')).toBe('');
    expect(formatPhone('+1')).toBe('');
  });
});
