import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { LoadError } from '../../components/LoadError';
import { optInChangeLabel } from '../../lib/notificationOptIn';
import { formatDateTimeShort } from '../../lib/dates';

interface OptInChange {
  id: string;
  channel: 'email' | 'sms';
  opted_in: boolean;
  reason: string;
  changed_at: string;
}

// When the customer agreed to (or stopped) ready messages (0085): the shop's
// record of consent.
export function OptInHistory({ customerId }: { customerId: string }) {
  const [changes, setChanges] = useState<OptInChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const reload = useCallback(() => setLoadCount((count) => count + 1), []);

  useEffect(() => {
    let active = true;
    void supabase
      .from('customer_opt_in_changes')
      .select('id, channel, opted_in, reason, changed_at')
      .eq('customer_id', customerId)
      .order('changed_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) {
          setError(errorMessage(err));
          return;
        }
        setError(null);
        setChanges((data ?? []) as OptInChange[]);
      });
    return () => {
      active = false;
    };
  }, [customerId, loadCount]);

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Opt-in history</h2>
      {error && <LoadError message={error} onRetry={reload} />}
      {changes && changes.length === 0 && <p className="text-sm text-slate-500">Never opted in.</p>}
      {changes && changes.length > 0 && (
        <ul className="space-y-1 text-sm">
          {changes.map((change) => (
            <li key={change.id} className="text-slate-700">
              {optInChangeLabel(change)}{' '}
              <span className="text-xs text-slate-500">
                · {formatDateTimeShort(change.changed_at)} ·{' '}
                {change.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
