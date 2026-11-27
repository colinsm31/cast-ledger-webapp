import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBack } from '../../app/BackContext';
import { useAuth } from '../../auth/AuthContext';
import { useDialog } from '../../components/Dialog';
import { LoadError } from '../../components/LoadError';
import { Spinner } from '../../components/Spinner';
import { formatDateTimeShort } from '../../lib/dates';
import {
  closeDay,
  fetchRecentCloses,
  fetchUnclosedDays,
  reopenDay,
  REOPEN_REASON_MAX,
  type DayClose,
} from '../../lib/dayCloses';
import { formatBusinessDay, shopToday } from '../../lib/dayReport';
import { fetchDrawers, fetchOpenSessions, type Drawer, type DrawerSession } from '../../lib/drawers';
import { errorMessage } from '../../lib/errors';
import { useSettings } from '../../lib/settings';

const inputClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const linkButtonClass =
  'inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50';
const primaryButtonClass =
  'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';

interface Loaded {
  drawers: Drawer[];
  openSessions: DrawerSession[];
  closes: DayClose[];
  /** Days with activity and no close, oldest first; today included if open (0115). */
  unclosedDays: string[];
}

// The end of the day: which drawers are still open, the daily report (X, the
// day so far), closing the day (which saves the Z report and locks the day),
// and past closes, which an admin can reopen.
export function EndOfDayPage() {
  useBack('/');
  const { settings } = useSettings();
  const { isAdmin } = useAuth();
  const { confirm } = useDialog();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [otherDay, setOtherDay] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [drawers, openSessions, closes, unclosedDays] = await Promise.all([
        fetchDrawers(),
        fetchOpenSessions(),
        fetchRecentCloses(),
        fetchUnclosedDays(),
      ]);
      setLoaded({ drawers, openSessions, closes, unclosedDays });
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (settings && !settings.time_zone) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-bold text-slate-900">End of day</h1>
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          An admin needs to set the shop&apos;s time zone in Settings before days can be reported or closed.
        </p>
      </div>
    );
  }
  if (loadError) return <LoadError message={loadError} onRetry={() => void load()} />;
  if (!settings || !loaded) return <Spinner label="Loading…" />;

  const today = shopToday(settings.time_zone as string);
  const todayClose = loaded.closes.find((close) => close.business_day === today && !close.reopened_at) ?? null;
  const drawerName = (id: string) => loaded.drawers.find((d) => d.id === id)?.name ?? 'A drawer';

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /** Drawers opened on or before a day that are still open: the day can't close until they do. */
  const openThrough = (day: string) => loaded.openSessions.filter((session) => session.business_day <= day);
  const earlierOpenDays = loaded.unclosedDays.filter((day) => day < today);

  async function closeTheDay(day: string) {
    const ok = await confirm({
      title: `Close ${formatBusinessDay(day)}?`,
      message:
        'The daily (Z) report is saved as it stands now, and no more sales, refunds or drawer changes can be ' +
        'dated that day unless an admin reopens it.',
      confirmLabel: 'Close the day',
    });
    if (ok) await run(() => closeDay(day));
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">End of day</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Today, {formatBusinessDay(today)}</h2>
        {todayClose ? (
          <>
            <p className="text-sm text-green-800">
              Closed {formatDateTimeShort(todayClose.closed_at)}
              {todayClose.closed_by ? ` by ${todayClose.closed_by}` : ''}.
            </p>
            <Link to={`/end-of-day/${today}/report`} className={linkButtonClass}>
              Print the Z report
            </Link>
          </>
        ) : (
          <>
            {loaded.openSessions.length > 0 ? (
              <div className="space-y-1 text-sm text-slate-600">
                <p>Still open (count and close each before closing the day):</p>
                <ul className="list-inside list-disc">
                  {loaded.openSessions.map((session) => (
                    <li key={session.id}>
                      {drawerName(session.drawer_id)}
                      {session.business_day !== today ? ` (opened ${formatBusinessDay(session.business_day)})` : ''}
                    </li>
                  ))}
                </ul>
                <Link to="/drawer" className="text-blue-600 hover:underline">
                  Count and close a drawer
                </Link>
              </div>
            ) : (
              <p className="text-sm text-slate-600">Every drawer is closed.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Link to={`/end-of-day/${today}/report`} className={linkButtonClass}>
                Print the day so far (X report)
              </Link>
              <button
                onClick={() => void closeTheDay(today)}
                disabled={busy || openThrough(today).length > 0}
                className={primaryButtonClass}
              >
                Close the day
              </button>
            </div>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </section>

      {earlierOpenDays.length > 0 && (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Earlier days not closed</h2>
          <p className="text-xs text-slate-500">
            Closing after midnight? Close the day you mean here; today stays open for sales.
          </p>
          <ul className="divide-y divide-slate-100">
            {earlierOpenDays.map((day) => (
              <li key={day} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <span className="font-medium text-slate-900">{formatBusinessDay(day)}</span>
                <Link to={`/end-of-day/${day}/report`} className="text-blue-600 hover:underline">
                  Daily report
                </Link>
                {openThrough(day).length > 0 && (
                  <span className="text-amber-700">
                    close {openThrough(day).map((session) => drawerName(session.drawer_id)).join(', ')} first
                  </span>
                )}
                <button
                  onClick={() => void closeTheDay(day)}
                  disabled={busy || openThrough(day).length > 0}
                  className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Close this day
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Another day</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            aria-label="Day to report"
            value={otherDay}
            max={today}
            onChange={(e) => setOtherDay(e.target.value)}
            className={inputClass}
          />
          {otherDay && (
            <Link to={`/end-of-day/${otherDay}/report`} className={linkButtonClass}>
              Daily report
            </Link>
          )}
        </div>
      </section>

      {loaded.closes.length > 0 && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Past closes</h2>
          <ul className="divide-y divide-slate-100">
            {loaded.closes.map((close) => (
              <PastClose
                key={close.id}
                close={close}
                canReopen={isAdmin && !close.reopened_at}
                busy={busy}
                onReopen={(reason) => run(() => reopenDay(close.business_day, reason))}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PastClose({
  close,
  canReopen,
  busy,
  onReopen,
}: {
  close: DayClose;
  canReopen: boolean;
  busy: boolean;
  onReopen: (reason: string) => Promise<void>;
}) {
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <li className="space-y-2 py-2 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-medium text-slate-900">{formatBusinessDay(close.business_day)}</span>
        <span className="text-slate-500">
          closed {formatDateTimeShort(close.closed_at)}
          {close.closed_by ? ` by ${close.closed_by}` : ''}
        </span>
        {close.reopened_at && (
          <span className="text-amber-700">
            reopened {formatDateTimeShort(close.reopened_at)}
            {close.reopened_by ? ` by ${close.reopened_by}` : ''}
            {close.reopen_reason ? `: ${close.reopen_reason}` : ''}
          </span>
        )}
        {!close.reopened_at && (
          <Link to={`/end-of-day/${close.business_day}/report`} className="text-blue-600 hover:underline">
            Z report
          </Link>
        )}
        {canReopen && !reopening && (
          <button onClick={() => setReopening(true)} className="ml-auto text-blue-600 hover:underline">
            Reopen
          </button>
        )}
      </div>
      {reopening && (
        <div className="flex flex-wrap items-end gap-2">
          <p className="w-full text-xs text-slate-500">
            Reopening lets the day be closed again. Sales, refunds and drawers are always dated today, so nothing new
            is added to a past day.
          </p>
          <label className="min-w-48 flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-500">Reason (optional)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={REOPEN_REASON_MAX}
              className={`w-full ${inputClass}`}
            />
          </label>
          <button
            onClick={() => void onReopen(reason).then(() => setReopening(false))}
            disabled={busy}
            className={primaryButtonClass}
          >
            Reopen the day
          </button>
          <button onClick={() => setReopening(false)} className="text-sm text-slate-600 hover:underline">
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}
