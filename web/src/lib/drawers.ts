// Cash drawers (0108): the shop's named drawers, each opened with a float and
// closed with a count. Each register device remembers which drawer it uses,
// like the receipt layout, since a register sits next to one drawer.

import { supabase } from './supabase';
import { errorMessage } from './errors';
import { formatMoney, roundCents } from './money';

/** A drawer name's longest length, matching the database's (0108). */
export const DRAWER_NAME_MAX = 50;

export interface Drawer {
  id: string;
  name: string;
  is_active: boolean;
}

export interface DrawerSession {
  id: string;
  drawer_id: string;
  business_day: string;
  opened_at: string;
  opened_by: string | null;
  float_amount: number;
  closed_at: string | null;
  counted_cash: number | null;
  /** Saved at the close (0109): float + cash taken − cash given back. */
  expected_cash: number | null;
  close_note: string | null;
}

/** What an open drawer should hold (drawer_cash_summary, 0109). */
export interface DrawerCashSummary {
  float_amount: number;
  cash_sales: number;
  cash_refunds: number;
  expected_cash: number;
  check_sales: number;
  check_refunds: number;
}

const SESSION_COLUMNS =
  'id, drawer_id, business_day, opened_at, opened_by, float_amount, closed_at, counted_cash, expected_cash, close_note';

function optionalNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function toSession(row: Record<string, unknown>): DrawerSession {
  return {
    ...(row as unknown as DrawerSession),
    float_amount: Number(row.float_amount),
    counted_cash: optionalNumber(row.counted_cash),
    expected_cash: optionalNumber(row.expected_cash),
  };
}

/** Counted − expected: positive is over, negative short; null until both are known. */
export function overShort(counted: number | null, expected: number | null): number | null {
  return counted === null || expected === null ? null : roundCents(counted - expected);
}

/** "Over $1.00", "Short $0.15" or "Even". */
export function overShortLabel(difference: number): string {
  if (difference > 0) return `Over ${formatMoney(difference)}`;
  if (difference < 0) return `Short ${formatMoney(-difference)}`;
  return 'Even';
}

export async function fetchCashSummary(sessionId: string): Promise<DrawerCashSummary> {
  const { data, error } = await supabase.rpc('drawer_cash_summary', { p_session_id: sessionId }).single();
  if (error) throw new Error(`Couldn't work out the drawer's cash: ${errorMessage(error)}`);
  const row = data as Record<string, unknown>;
  return {
    float_amount: Number(row.float_amount),
    cash_sales: Number(row.cash_sales),
    cash_refunds: Number(row.cash_refunds),
    expected_cash: Number(row.expected_cash),
    check_sales: Number(row.check_sales),
    check_refunds: Number(row.check_refunds),
  };
}

export async function fetchDrawers(): Promise<Drawer[]> {
  const { data, error } = await supabase.from('drawers').select('id, name, is_active').order('name');
  if (error) throw new Error(`Couldn't load the drawers: ${errorMessage(error)}`);
  return (data ?? []) as Drawer[];
}

/** Every drawer session still open. */
export async function fetchOpenSessions(): Promise<DrawerSession[]> {
  const { data, error } = await supabase.from('drawer_sessions').select(SESSION_COLUMNS).is('closed_at', null);
  if (error) throw new Error(`Couldn't load the open drawers: ${errorMessage(error)}`);
  return (data ?? []).map(toSession);
}

export async function fetchSession(sessionId: string): Promise<DrawerSession> {
  const { data, error } = await supabase.from('drawer_sessions').select(SESSION_COLUMNS).eq('id', sessionId).single();
  if (error) throw new Error(`Couldn't load the drawer: ${errorMessage(error)}`);
  return toSession(data);
}

export async function openDrawer(drawerId: string, counts: Record<string, number>): Promise<string> {
  const { data, error } = await supabase.rpc('open_drawer', { p_drawer_id: drawerId, p_counts: counts });
  if (error) throw new Error(errorMessage(error));
  return data as string;
}

export async function closeDrawer(sessionId: string, counts: Record<string, number>, note: string): Promise<void> {
  const { error } = await supabase.rpc('close_drawer', { p_session_id: sessionId, p_counts: counts, p_note: note });
  if (error) throw new Error(errorMessage(error));
}

// MARK: - This device's drawer

const STORAGE_KEY = 'acestock.drawerId';

export function rememberedDrawerId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function rememberDrawer(drawerId: string) {
  try {
    localStorage.setItem(STORAGE_KEY, drawerId);
  } catch {
    // Blocked storage just means choosing the drawer again next time.
  }
}

/** The request header that tells the server which drawer this register's cash goes to (0109). */
export const DRAWER_HEADER = 'x-acestock-drawer';

/**
 * A money request (sale, refund, exchange, string change) marked with this
 * device's drawer, so its cash goes there. With no drawer remembered, the
 * server uses the only open drawer.
 */
export function withRegisterDrawer<T>(request: T): T {
  const drawerId = rememberedDrawerId();
  const builder = request as { setHeader?: (name: string, value: string) => T };
  return drawerId && typeof builder.setHeader === 'function' ? builder.setHeader(DRAWER_HEADER, drawerId) : request;
}

/**
 * The drawer this device uses: the one it remembers if that's still in use,
 * else the only drawer in use; null when there are several to choose from.
 */
export function chooseDeviceDrawer(drawers: Drawer[], remembered: string | null): Drawer | null {
  const active = drawers.filter((drawer) => drawer.is_active);
  return active.find((drawer) => drawer.id === remembered) ?? (active.length === 1 ? active[0] : null);
}

export type RegisterDrawerState = 'open' | 'closed' | 'choose' | 'unknown';

/**
 * Whether this register's drawer is open: the remembered (or only) drawer has
 * an open session; or, with several drawers open and none chosen, it must be
 * chosen first. 'unknown' while loading or if the check can't load.
 */
export function registerDrawerState(
  drawers: Drawer[],
  openDrawerIds: string[],
  remembered: string | null,
): RegisterDrawerState {
  const drawer = chooseDeviceDrawer(drawers, remembered);
  if (drawer) return openDrawerIds.includes(drawer.id) ? 'open' : 'closed';
  if (openDrawerIds.length === 1) return 'open';
  return openDrawerIds.length === 0 ? 'closed' : 'choose';
}
