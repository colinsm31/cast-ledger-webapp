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
  lines: HeldCartLine[];
  customer: Customer | null;
  stringJobId: string | null;
  deliverAfter: boolean;
}

const KEY = 'acestock.heldSale';
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function getHeldSale(): HeldSale | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HeldSale;
    return parsed.lines?.length ? parsed : null;
  } catch {
    return null;
  }
}

// Save the ticket, or clear it when empty.
export function setHeldSale(sale: HeldSale | null) {
  try {
    if (sale && sale.lines.length > 0) localStorage.setItem(KEY, JSON.stringify(sale));
    else localStorage.removeItem(KEY);
  } catch {
    // ignore storage errors (private mode, quota)
  }
  notify();
}

export function clearHeldSale() {
  setHeldSale(null);
}

// Subscribe to held-sale changes (same tab) and cross-tab storage events.
function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

// Reactive access to the current held sale (for the header flag).
export function useHeldSale(): HeldSale | null {
  const [held, setHeld] = useState<HeldSale | null>(() => getHeldSale());
  useEffect(() => subscribe(() => setHeld(getHeldSale())), []);
  return held;
}
