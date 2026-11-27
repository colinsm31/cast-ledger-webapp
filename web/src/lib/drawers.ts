// Cash drawers (0108): the shop's named drawers, each opened with a float and
// closed with a count. Each register device remembers which drawer it uses,
// like the receipt layout, since a register sits next to one drawer.

import { supabase } from './supabase';
import { errorMessage } from './errors';

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
  close_note: string | null;
}

const SESSION_COLUMNS = 'id, drawer_id, business_day, opened_at, opened_by, float_amount, closed_at, counted_cash, close_note';

function toSession(row: Record<string, unknown>): DrawerSession {
  return {
    ...(row as unknown as DrawerSession),
    float_amount: Number(row.float_amount),
    counted_cash: row.counted_cash == null ? null : Number(row.counted_cash),
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

/**
 * The drawer this device uses: the one it remembers if that's still in use,
 * else the only drawer in use; null when there are several to choose from.
 */
export function chooseDeviceDrawer(drawers: Drawer[], remembered: string | null): Drawer | null {
  const active = drawers.filter((drawer) => drawer.is_active);
  return active.find((drawer) => drawer.id === remembered) ?? (active.length === 1 ? active[0] : null);
}
