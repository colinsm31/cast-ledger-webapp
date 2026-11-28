// Cash drawers (0108): the shop's named drawers, each opened with a float and
// closed with a count. Each register device remembers which drawer it uses,
// like the receipt layout, since a register sits next to one drawer.

import { supabase } from './supabase';
import { errorMessage } from './errors';
import { formatMoney, hasSubCent, roundCents } from './money';
import { parseNumberField } from './numberInput';

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
  /** Cash put in or taken out outside a sale (0110). */
  paid_in: number;
  paid_out: number;
  expected_cash: number;
  check_sales: number;
  check_refunds: number;
}

export type DrawerMovementKind = 'paid_in' | 'paid_out';

/** Cash paid into or out of a drawer outside a sale (0110). */
export interface DrawerMovement {
  id: string;
  kind: DrawerMovementKind;
  amount: number;
  reason: string | null;
  created_at: string;
}

/** A paid-in or paid-out reason's longest length, matching the database's (0110). */
export const MOVEMENT_REASON_MAX = 200;

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
    paid_in: Number(row.paid_in),
    paid_out: Number(row.paid_out),
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

export async function fetchMovements(sessionId: string): Promise<DrawerMovement[]> {
  const { data, error } = await supabase
    .from('drawer_movements')
    .select('id, kind, amount, reason, created_at')
    .eq('drawer_session_id', sessionId)
    .order('created_at');
  if (error) throw new Error(`Couldn't load the paid-ins and paid-outs: ${errorMessage(error)}`);
  return (data ?? []).map((row) => ({ ...(row as DrawerMovement), amount: Number(row.amount) }));
}

/** The largest paid-in or paid-out the database takes (0116). */
export const MOVEMENT_MAX = 999_999.99;

/** The amount to record, or what's wrong with what was typed. */
export function parseMovementAmount(text: string): { amount: number } | { error: string } {
  const parsed = parseNumberField(text, 'Amount', 'decimal', { max: MOVEMENT_MAX });
  if ('error' in parsed) return parsed;
  if (parsed.value === null || parsed.value <= 0) return { error: 'Amount: enter an amount over $0, like 20.00.' };
  if (hasSubCent(text)) return { error: 'Amount: use at most 2 decimal places.' };
  return { amount: parsed.value };
}

export async function recordMovement(
  sessionId: string,
  kind: DrawerMovementKind,
  amount: number,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('record_drawer_movement', {
    p_session_id: sessionId,
    p_kind: kind,
    p_amount: amount,
    p_reason: reason.trim() || null,
  });
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

export function forgetDrawer() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing remembered to forget.
  }
}

/**
 * This device's remembered drawer, forgotten (and null) once it's out of use
 * or gone, so the register stops sending it and can choose again (4B review 1).
 */
export function pruneRememberedDrawer(drawers: Drawer[]): string | null {
  const remembered = rememberedDrawerId();
  if (remembered && !drawers.some((drawer) => drawer.id === remembered && drawer.is_active)) {
    forgetDrawer();
    return null;
  }
  return remembered;
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
 * an open session; with several drawers in use and none chosen, it must be
 * chosen first. 'unknown' while loading or if the check can't load.
 */
export function registerDrawerState(
  drawers: Drawer[],
  openDrawerIds: string[],
  remembered: string | null,
): RegisterDrawerState {
  const drawer = chooseDeviceDrawer(drawers, remembered);
  if (drawer) return openDrawerIds.includes(drawer.id) ? 'open' : 'closed';
  // Several drawers in use and none chosen: the server won't guess (4B review 3).
  return drawers.some((d) => d.is_active) ? 'choose' : 'closed';
}
