import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchDrawers,
  fetchOpenSessions,
  registerDrawerState,
  rememberedDrawerId,
  type RegisterDrawerState,
} from '../../lib/drawers';

// A reminder at the register when cash can't be taken because this register's
// drawer isn't open (only while the shop requires an open drawer for cash).
export function RegisterDrawerNotice({ cashNeedsDrawer }: { cashNeedsDrawer: boolean }) {
  const [state, setState] = useState<RegisterDrawerState>('unknown');

  useEffect(() => {
    if (!cashNeedsDrawer) return;
    let active = true;
    Promise.all([fetchDrawers(), fetchOpenSessions()]).then(
      ([drawers, sessions]) => {
        if (active) setState(registerDrawerState(drawers, sessions.map((s) => s.drawer_id), rememberedDrawerId()));
      },
      () => {
        // The server still refuses cash without a drawer; the reminder is only a convenience.
      },
    );
    return () => {
      active = false;
    };
  }, [cashNeedsDrawer]);

  if (!cashNeedsDrawer || state === 'open' || state === 'unknown') return null;
  return (
    <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
      {state === 'choose'
        ? 'Choose this register\'s drawer before taking or giving back cash. '
        : 'This register\'s cash drawer isn\'t open, so cash can\'t be taken or given back. '}
      <Link to="/drawer" className="font-semibold underline">
        Go to the cash drawer
      </Link>
    </p>
  );
}
