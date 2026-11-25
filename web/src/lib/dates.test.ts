import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDateTimeShort } from './dates';

describe('formatDateTime / formatDateTimeShort', () => {
  const iso = '2026-11-24T18:05:00Z';
  it('write the time in the browser\'s format', () => {
    expect(formatDateTime(iso)).toBe(new Date(iso).toLocaleString());
    expect(formatDateTimeShort(iso)).toBe(new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }));
  });
  it('show a dash for something that isn\'t a date', () => {
    expect(formatDateTime('not a date')).toBe('—');
    expect(formatDateTimeShort('')).toBe('—');
  });
});
