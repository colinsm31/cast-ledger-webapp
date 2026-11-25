// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { browserTimeZone, parseLocalDate, periodRange, usePeriodRange } from './reportPeriod';

// Wednesday 25 November 2026, 3:30 PM local.
const now = new Date(2026, 10, 25, 15, 30);

describe('periodRange', () => {
  it('today runs from local midnight to now', () => {
    expect(periodRange('today', '', '', false, now)).toEqual({ from: new Date(2026, 10, 25), to: now });
  });
  it('week to date starts Sunday, or Monday when the shop says so', () => {
    expect(periodRange('wtd', '', '', false, now)?.from).toEqual(new Date(2026, 10, 22));
    expect(periodRange('wtd', '', '', true, now)?.from).toEqual(new Date(2026, 10, 23));
    const sunday = new Date(2026, 10, 29, 10);
    expect(periodRange('wtd', '', '', true, sunday)?.from).toEqual(new Date(2026, 10, 23));
  });
  it('month and year to date start on the 1st', () => {
    expect(periodRange('mtd', '', '', false, now)?.from).toEqual(new Date(2026, 10, 1));
    expect(periodRange('ytd', '', '', false, now)?.from).toEqual(new Date(2026, 0, 1));
  });
  it('a custom range includes its last day', () => {
    expect(periodRange('custom', '2026-11-01', '2026-11-03', false, now)).toEqual({
      from: new Date(2026, 10, 1),
      to: new Date(2026, 10, 4),
    });
  });
  it('a custom range waits for both days, the right way round', () => {
    expect(periodRange('custom', '2026-11-01', '', false, now)).toBeNull();
    expect(periodRange('custom', '2026-11-05', '2026-11-01', false, now)).toBeNull();
  });
});

describe('parseLocalDate', () => {
  it('reads YYYY-MM-DD as local midnight', () => {
    expect(parseLocalDate('2026-02-28')).toEqual(new Date(2026, 1, 28));
  });
  it('refuses anything else', () => {
    expect(parseLocalDate('2026-02-30')).toBeNull();
    expect(parseLocalDate('11/25/2026')).toBeNull();
  });
});

describe('browserTimeZone', () => {
  it('names a time zone', () => {
    expect(browserTimeZone()).toMatch(/\w/);
  });
});

describe('usePeriodRange', () => {
  it('starts on the period given and follows changes', () => {
    const { result } = renderHook(() => usePeriodRange(false, 'mtd'));
    expect(result.current.period).toBe('mtd');
    act(() => result.current.setPeriod('custom'));
    expect(result.current.range).toBeNull();
    act(() => {
      result.current.setCustomFrom('2026-11-01');
      result.current.setCustomTo('2026-11-01');
    });
    expect(result.current.range).toEqual({ from: new Date(2026, 10, 1), to: new Date(2026, 10, 2) });
  });
});
