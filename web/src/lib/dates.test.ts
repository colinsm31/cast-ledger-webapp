import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDateTimeShort } from './dates';

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

describe('formatDate', () => {
  it('writes the day in the browser\'s format', () => {
    expect(formatDate('2026-11-24T18:05:00Z')).toBe(new Date('2026-11-24T18:05:00Z').toLocaleDateString());
  });
  it('shows a dash for nothing or something that isn\'t a date', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('nope')).toBe('—');
  });
});

describe('times in the shop\'s time zone', () => {
  it('writes a moment in the zone given', () => {
    expect(formatDateTimeShort('2026-11-28T03:00:00Z', 'America/Chicago')).toContain('9:00');
    expect(formatDateTime('2026-11-28T03:00:00Z', 'UTC')).toContain('3:00:00');
  });
});
