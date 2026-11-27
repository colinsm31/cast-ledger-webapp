// The daily (X / Z) report (report_day, 0111): one business day in the shop's
// time zone, for printing at the close.

import { supabase } from './supabase';
import { errorMessage } from './errors';

export interface DayReportPayment {
  method: string;
  label: string;
  taken: number;
  given_back: number;
  net: number;
}

export interface DayReportCategory {
  name: string;
  sold: number;
  returned: number;
  net: number;
}

export interface DayReportDrawer {
  drawer: string;
  opened_at: string;
  closed_at: string | null;
  float: number;
  cash_sales: number;
  cash_refunds: number;
  paid_in: number;
  paid_out: number;
  expected: number;
  counted: number | null;
  over_short: number | null;
}

export interface DayReport {
  day: string;
  time_zone: string;
  sales: { count: number; items: number; gift_cards: number; tax: number };
  refunds: { count: number; items: number; gift_cards: number; tax: number };
  exchanges: { count: number; credit: number };
  payments: DayReportPayment[];
  categories: DayReportCategory[];
  drawers: DayReportDrawer[];
}

export async function fetchDayReport(day: string): Promise<DayReport> {
  const { data, error } = await supabase.rpc('report_day', { p_day: day });
  if (error) throw new Error(`Couldn't load the daily report: ${errorMessage(error)}`);
  return data as DayReport;
}

/** A sale or refund side's total: items + gift cards + tax. */
export function sideTotal(side: DayReport['sales']): number {
  return Math.round((side.items + side.gift_cards + side.tax) * 100) / 100;
}

/** Today's date ("2026-11-27") in the shop's time zone. */
export function shopToday(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** "Friday, November 27, 2026" for a "2026-11-27" business day. */
export function formatBusinessDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date)).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
