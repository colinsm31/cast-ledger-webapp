import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useBack } from '../../app/BackContext';
import { LoadError } from '../../components/LoadError';
import { Spinner } from '../../components/Spinner';
import { formatBusinessDay, shopToday } from '../../lib/dayReport';
import { fetchDrawers, fetchOpenSessions, type Drawer, type DrawerSession } from '../../lib/drawers';
import { errorMessage } from '../../lib/errors';
import { useSettings } from '../../lib/settings';

const inputClass =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
const linkButtonClass =
  'inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50';

// The end of the day: which drawers are still open, and the daily report for
// today (X, the day so far) or any other day.
export function EndOfDayPage() {
  useBack('/');
  const { settings } = useSettings();
  const [drawers, setDrawers] = useState<Drawer[] | null>(null);
  const [openSessions, setOpenSessions] = useState<DrawerSession[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [otherDay, setOtherDay] = useState('');

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [loadedDrawers, sessions] = await Promise.all([fetchDrawers(), fetchOpenSessions()]);
      setDrawers(loadedDrawers);
      setOpenSessions(sessions);
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
  if (!settings || !drawers) return <Spinner label="Loading…" />;

  const today = shopToday(settings.time_zone as string);
  const drawerName = (id: string) => drawers.find((d) => d.id === id)?.name ?? 'A drawer';

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">End of day</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Today, {formatBusinessDay(today)}</h2>
        {openSessions.length > 0 ? (
          <div className="space-y-1 text-sm text-slate-600">
            <p>Still open:</p>
            <ul className="list-inside list-disc">
              {openSessions.map((session) => (
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
        <Link to={`/end-of-day/${today}/report`} className={linkButtonClass}>
          Print the day so far (X report)
        </Link>
      </section>

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
    </div>
  );
}
