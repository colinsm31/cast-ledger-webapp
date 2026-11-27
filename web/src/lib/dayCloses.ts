// Closing a business day (0112): the close saves the daily report as it stood,
// and the day is then locked until an admin reopens it.

import { supabase } from './supabase';
import { errorMessage } from './errors';
import { servedByName } from './receipt';
import { fetchDayReport, type DayReport } from './dayReport';

export interface DayClose {
  id: string;
  business_day: string;
  closed_at: string;
  /** The part of the closer's email before the @. */
  closed_by: string | null;
  report: DayReport;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
}

/** A reopen reason's longest length, matching the database's (0112). */
export const REOPEN_REASON_MAX = 500;

const CLOSE_COLUMNS =
  'id, business_day, closed_at, report, reopened_at, reopen_reason, ' +
  'closer:profiles!day_closes_closed_by_fkey(email), reopener:profiles!day_closes_reopened_by_fkey(email)';

interface DayCloseRow {
  id: string;
  business_day: string;
  closed_at: string;
  report: DayReport;
  reopened_at: string | null;
  reopen_reason: string | null;
  closer: { email: string | null } | null;
  reopener: { email: string | null } | null;
}

function toDayClose(row: DayCloseRow): DayClose {
  return {
    id: row.id,
    business_day: row.business_day,
    closed_at: row.closed_at,
    closed_by: servedByName(row.closer),
    report: row.report,
    reopened_at: row.reopened_at,
    reopened_by: servedByName(row.reopener),
    reopen_reason: row.reopen_reason,
  };
}

/** The day's close in force, or null if the day is open. */
export async function fetchDayClose(day: string): Promise<DayClose | null> {
  const { data, error } = await supabase
    .from('day_closes')
    .select(CLOSE_COLUMNS)
    .eq('business_day', day)
    .is('reopened_at', null)
    .maybeSingle();
  if (error) throw new Error(`Couldn't check whether the day is closed: ${errorMessage(error)}`);
  return data ? toDayClose(data as unknown as DayCloseRow) : null;
}

/** The latest closes, newest first, reopened ones included. */
export async function fetchRecentCloses(limit = 14): Promise<DayClose[]> {
  const { data, error } = await supabase
    .from('day_closes')
    .select(CLOSE_COLUMNS)
    .order('closed_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Couldn't load the past closes: ${errorMessage(error)}`);
  return ((data ?? []) as unknown as DayCloseRow[]).map(toDayClose);
}

/**
 * The report to print for a day: once closed, the report saved at the close
 * (the Z report) with its close; otherwise the day so far (X), with no close.
 */
export async function fetchPrintableDayReport(day: string): Promise<{ report: DayReport; close: DayClose | null }> {
  const close = await fetchDayClose(day);
  return { report: close ? close.report : await fetchDayReport(day), close };
}

/** Days in the last month with activity and no close, plus today if open, oldest first (0115). */
export async function fetchUnclosedDays(): Promise<string[]> {
  const { data, error } = await supabase.rpc('unclosed_days');
  if (error) throw new Error(`Couldn't load the days still open: ${errorMessage(error)}`);
  return (data ?? []) as string[];
}

export async function closeDay(day: string): Promise<void> {
  const { error } = await supabase.rpc('close_day', { p_day: day });
  if (error) throw new Error(errorMessage(error));
}

export async function reopenDay(day: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_day', { p_day: day, p_reason: reason.trim() || null });
  if (error) throw new Error(errorMessage(error));
}
