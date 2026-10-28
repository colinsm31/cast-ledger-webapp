import { useEffect, useState } from 'react';
import type { Customer } from '../types/domain';

// A sale ticket in progress, persisted so the register can be left and resumed.
export interface HeldCartLine {
  key: string;
  productId?: string;
  stringJobId?: string;
  label: string;
  price: string;
  qty: number;
}

export interface HeldSale {
  /** The staff member who started the ticket; nobody else sees it. */
  userId: string;
  lines: HeldCartLine[];
  customer: Customer | null;
  stringJobId: string | null;
  deliverAfter: boolean;
}

// One saved ticket per staff member, so one person's ticket is never shown
// to, cleared by or overwritten by another on the same device.
const KEY_PREFIX = 'acestock.heldSale:';
const LEGACY_KEY = 'acestock.heldSale'; // before tickets had an owner
const keyFor = (userId: string) => KEY_PREFIX + userId;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

/** The held ticket if it has lines and belongs to this staff member, else null. */
export function heldSaleFor(held: HeldSale | null, userId: string | undefined): HeldSale | null {
  if (!held || !userId || held.userId !== userId) return null;
  return held.lines?.length ? held : null;
}

/** "3 items, Pat Family" — for the sign-out warning. */
export function heldSaleSummary(held: HeldSale, customerLabel: string | null): string {
  const items = held.lines.reduce((n, l) => n + l.qty, 0);
  return [`${items} item${items === 1 ? '' : 's'}`, customerLabel].filter(Boolean).join(', ');
}

export function getHeldSale(userId: string | undefined): HeldSale | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(keyFor(userId));
    return raw ? heldSaleFor(JSON.parse(raw) as HeldSale, userId) : null;
  } catch {
    return null;
  }
}

// Save this staff member's ticket, or clear it when empty.
export function setHeldSale(userId: string, sale: HeldSale | null) {
  try {
    if (sale && sale.lines.length > 0) localStorage.setItem(keyFor(userId), JSON.stringify({ ...sale, userId }));
    else localStorage.removeItem(keyFor(userId));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore storage errors (private mode, quota)
  }
  notify();
}

export function clearHeldSale(userId: string) {
  setHeldSale(userId, null);
}

// Subscribe to held-sale changes (same tab) and cross-tab storage events.
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(KEY_PREFIX)) fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

// Reactive access to this staff member's held sale (for the home screen and sign-out).
export function useHeldSale(userId: string | undefined): HeldSale | null {
  const [held, setHeld] = useState<HeldSale | null>(() => getHeldSale(userId));
  useEffect(() => {
    setHeld(getHeldSale(userId));
    return subscribe(() => setHeld(getHeldSale(userId)));
  }, [userId]);
  return held;
}
