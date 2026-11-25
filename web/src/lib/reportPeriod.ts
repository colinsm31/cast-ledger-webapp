// The period a report or list covers: today, week/month/year to date, or a
// custom range of whole days. Days are the browser's local days, and every
// range is [from, to): `to` itself isn't included.

import { useMemo, useState } from 'react';

export type Period = 'today' | 'wtd' | 'mtd' | 'ytd' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
}

export const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'wtd', label: 'Week to date' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'custom', label: 'Custom range' },
];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** "2026-11-25" as local midnight; null for anything else. */
export function parseLocalDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 ? date : null;
}

/**
 * The range a period covers at `now`. A custom range includes its end day,
 * and is null until both days are chosen, or if they're the wrong way round.
 */
export function periodRange(
  period: Period,
  customFrom: string,
  customTo: string,
  weekStartsMonday: boolean,
  now: Date = new Date(),
): DateRange | null {
  if (period === 'today') return { from: startOfDay(now), to: now };
  if (period === 'wtd') {
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const daysBack = weekStartsMonday ? (dayOfWeek + 6) % 7 : dayOfWeek;
    return { from: addDays(startOfDay(now), -daysBack), to: now };
  }
  if (period === 'mtd') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
  if (period === 'ytd') return { from: new Date(now.getFullYear(), 0, 1), to: now };
  const from = parseLocalDate(customFrom);
  const to = parseLocalDate(customTo);
  if (!from || !to || to < from) return null;
  return { from, to: addDays(to, 1) };
}

/** The browser's time zone name, e.g. "America/Chicago" (UTC if unknown). */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** Period picker state and the range it resolves to. */
export function usePeriodRange(weekStartsMonday: boolean, initial: Period = 'today') {
  const [period, setPeriod] = useState<Period>(initial);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const range = useMemo(
    () => periodRange(period, customFrom, customTo, weekStartsMonday),
    [period, customFrom, customTo, weekStartsMonday],
  );
  return { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range };
}

export type PeriodState = ReturnType<typeof usePeriodRange>;
