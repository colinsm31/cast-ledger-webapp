import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../lib/errors';
import {
  canResend,
  channelLabel,
  fetchNotifications,
  notificationKindLabel,
  notificationStatusLabel,
  resendNotification,
  type NotificationRow,
  type NotificationStatus,
} from '../lib/notifications';
import { LoadError } from './LoadError';
import { sendQueuedMessagesQuietly } from '../lib/sendNotifications';

const STATUS_CLASSES: Record<NotificationStatus, string> = {
  queued: 'bg-slate-100 text-slate-700',
  sending: 'bg-blue-100 text-blue-800',
  sent: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  skipped: 'bg-amber-100 text-amber-800',
};

function when(iso: string): string {
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// Messages sent (or tried) to a customer, for a customer, a job or a sale
// (0086). A message that failed, wasn't sent, is still waiting or is stuck
// sending can be sent again (0088): it's put back in the queue and that one
// message is handed to the sender.
export function NotificationLog({
  filter,
  title = 'Messages',
  refreshKey = 0,
  emptyText = 'No messages yet.',
}: {
  filter: { customerId?: string; stringJobId?: string; saleId?: string };
  title?: string;
  /** Change it to load again, e.g. after something new was queued. */
  refreshKey?: number;
  emptyText?: string;
}) {
  const { customerId, stringJobId, saleId } = filter;
  const [rows, setRows] = useState<NotificationRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const reload = useCallback(() => setLoadCount((count) => count + 1), []);

  useEffect(() => {
    let active = true;
    fetchNotifications({ customerId, stringJobId, saleId }).then(
      (loaded) => {
        if (!active) return;
        setRows(loaded);
        setLoadError(null);
      },
      (err: unknown) => {
        if (active) setLoadError(errorMessage(err));
      },
    );
    return () => {
      active = false;
    };
  }, [customerId, stringJobId, saleId, refreshKey, loadCount]);

  async function sendAgain(row: NotificationRow) {
    setBusyId(row.id);
    setActionError(null);
    setNotice(null);
    try {
      await resendNotification(row.id);
      setNotice(
        await sendQueuedMessagesQuietly({ notificationId: row.id }, notificationKindLabel(row.kind)),
      );
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
      reload();
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      {loadError && <LoadError message={loadError} onRetry={reload} />}
      {actionError && <p className="text-sm text-red-600">{actionError}</p>}
      {notice && <p className="text-sm text-slate-600">{notice}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-slate-500">{emptyText}</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="text-slate-800">
                  {notificationKindLabel(row.kind)} · {channelLabel(row.channel)} to {row.to_address}
                </p>
                <p className="text-xs text-slate-500">
                  {when(row.created_at)}
                  {row.attempts > 1 && ` · ${row.attempts} tries`}
                </p>
                {row.error && <p className="text-xs text-red-700">{row.error}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[row.status]}`}>
                  {notificationStatusLabel(row.status)}
                </span>
                {canResend(row) && (
                  <button
                    onClick={() => void sendAgain(row)}
                    disabled={busyId !== null}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {busyId === row.id ? 'Sending…' : 'Send again'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
