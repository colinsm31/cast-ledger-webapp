import { useCallback, useEffect, useState } from 'react';
import { useBack } from '../../app/BackContext';
import { useDialog } from '../../components/Dialog';
import { DenominationCounter } from '../../components/DenominationCounter';
import { LoadError } from '../../components/LoadError';
import { Spinner } from '../../components/Spinner';
import { formatDateTime } from '../../lib/dates';
import { countTotal, emptyCount, hasCountStarted, parseCount } from '../../lib/denominations';
import {
  chooseDeviceDrawer,
  closeDrawer,
  fetchCashSummary,
  fetchDrawers,
  fetchMovements,
  fetchOpenSessions,
  fetchSession,
  openDrawer,
  overShort,
  overShortLabel,
  rememberDrawer,
  rememberedDrawerId,
  type Drawer,
  type DrawerCashSummary,
  type DrawerMovement,
  type DrawerSession,
} from '../../lib/drawers';
import { errorMessage } from '../../lib/errors';
import { formatMoney } from '../../lib/money';
import { useSettings } from '../../lib/settings';
import { DrawerMovements } from './DrawerMovements';

const buttonClass =
  'rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

interface Loaded {
  drawers: Drawer[];
  openSessions: DrawerSession[];
}

// This register's cash drawer: open it with a float in the morning, close it
// with a count at night.
export function DrawerPage() {
  useBack('/');
  const { settings } = useSettings();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drawerId, setDrawerId] = useState<string | null>(rememberedDrawerId());
  const [choosing, setChoosing] = useState(false);
  const [lastClosed, setLastClosed] = useState<DrawerSession | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [drawers, openSessions] = await Promise.all([fetchDrawers(), fetchOpenSessions()]);
      setLoaded({ drawers, openSessions });
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) return <LoadError message={loadError} onRetry={() => void load()} />;
  if (!loaded) return <Spinner label="Loading…" />;

  const drawer = choosing ? null : chooseDeviceDrawer(loaded.drawers, drawerId);
  const activeDrawers = loaded.drawers.filter((d) => d.is_active);

  function choose(id: string) {
    rememberDrawer(id);
    setDrawerId(id);
    setChoosing(false);
    setLastClosed(null);
  }

  async function afterClose(sessionId: string) {
    await load();
    try {
      setLastClosed(await fetchSession(sessionId));
    } catch {
      // The drawer is closed either way; the summary is only a convenience.
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Cash drawer</h1>
      {settings && !settings.time_zone && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          An admin needs to set the shop&apos;s time zone in Settings before drawers can be opened.
        </p>
      )}
      {lastClosed && <ClosedDrawerResult session={lastClosed} />}
      {activeDrawers.length === 0 ? (
        <p className="text-sm text-slate-500">No drawers are in use. An admin can add one in Settings.</p>
      ) : !drawer ? (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Which drawer is at this register?</h2>
          <div className="flex flex-wrap gap-2">
            {activeDrawers.map((d) => (
              <button key={d.id} onClick={() => choose(d.id)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                {d.name}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <DrawerPanel
          key={drawer.id}
          drawer={drawer}
          session={loaded.openSessions.find((s) => s.drawer_id === drawer.id) ?? null}
          canChange={activeDrawers.length > 1}
          onChange={() => setChoosing(true)}
          onOpened={() => {
            setLastClosed(null);
            void load();
          }}
          onClosed={(sessionId) => void afterClose(sessionId)}
        />
      )}
    </div>
  );
}

function DrawerPanel({
  drawer,
  session,
  canChange,
  onChange,
  onOpened,
  onClosed,
}: {
  drawer: Drawer;
  session: DrawerSession | null;
  canChange: boolean;
  onChange: () => void;
  onOpened: () => void;
  onClosed: (sessionId: string) => void;
}) {
  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{drawer.name}</h2>
        <span className={session ? 'text-sm text-green-700' : 'text-sm text-slate-500'}>{session ? 'Open' : 'Closed'}</span>
        {canChange && (
          <button onClick={onChange} className="ml-auto text-sm text-blue-600 hover:underline">
            Use another drawer
          </button>
        )}
      </div>
      {session ? (
        <CloseDrawerForm session={session} onClosed={() => onClosed(session.id)} />
      ) : (
        <OpenDrawerForm drawer={drawer} onOpened={onOpened} />
      )}
    </section>
  );
}

function OpenDrawerForm({ drawer, onOpened }: { drawer: Drawer; onOpened: () => void }) {
  const [count, setCount] = useState(emptyCount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    const parsed = parseCount(count);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await openDrawer(drawer.id, parsed.counts);
      onOpened();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <DenominationCounter label="Starting float" value={count} onChange={setCount} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={() => void open()} disabled={saving} className={buttonClass}>
        {saving ? 'Opening…' : 'Open drawer'}
      </button>
    </div>
  );
}

function CloseDrawerForm({ session, onClosed }: { session: DrawerSession; onClosed: () => void }) {
  const { confirm } = useDialog();
  const [summary, setSummary] = useState<DrawerCashSummary | null>(null);
  const [movements, setMovements] = useState<DrawerMovement[]>([]);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [count, setCount] = useState(emptyCount);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    setSummaryError(null);
    try {
      const [loadedSummary, loadedMovements] = await Promise.all([fetchCashSummary(session.id), fetchMovements(session.id)]);
      setSummary(loadedSummary);
      setMovements(loadedMovements);
    } catch (err) {
      setSummaryError(errorMessage(err));
    }
  }, [session.id]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // Over/short shows once counting has started, not as "short" by everything before.
  const difference = hasCountStarted(count) ? overShort(countTotal(count), summary?.expected_cash ?? null) : null;

  async function close() {
    const parsed = parseCount(count);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    // The expected cash may have moved since the page loaded: check it again.
    const latest = await fetchCashSummary(session.id).catch(() => summary);
    const finalDifference = overShort(parsed.total, latest?.expected_cash ?? null);
    const ok = await confirm({
      title: 'Close the drawer?',
      message:
        `Counted ${formatMoney(parsed.total)}` +
        (finalDifference === null ? '. ' : ` (${overShortLabel(finalDifference).toLowerCase()}). `) +
        "The count can't be changed after closing.",
      confirmLabel: 'Close drawer',
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      await closeDrawer(session.id, parsed.counts, note);
      onClosed();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Opened {formatDateTime(session.opened_at)}.</p>
      {summaryError && <LoadError message={summaryError} onRetry={() => void loadSummary()} />}
      {summary && <CashSummaryTable summary={summary} />}
      <DrawerMovements sessionId={session.id} movements={movements} onRecorded={() => void loadSummary()} />
      <DenominationCounter label="Count the drawer" value={count} onChange={setCount} />
      {difference !== null && (
        <p className={difference === 0 ? 'text-sm font-semibold text-green-700' : 'text-sm font-semibold text-amber-700'}>
          {overShortLabel(difference)}
        </p>
      )}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Note (optional)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputClass} />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button onClick={() => void close()} disabled={saving} className={buttonClass}>
        {saving ? 'Closing…' : 'Close drawer'}
      </button>
    </div>
  );
}

function CashSummaryTable({ summary }: { summary: DrawerCashSummary }) {
  const rows: [string, number][] = [
    ['Starting float', summary.float_amount],
    ['Cash taken', summary.cash_sales],
    ['Cash given back', -summary.cash_refunds],
    ['Paid in', summary.paid_in],
    ['Paid out', -summary.paid_out],
  ];
  const checks = summary.check_sales - summary.check_refunds;
  return (
    <dl className="max-w-sm space-y-1 text-sm">
      {rows.map(([label, amount]) => (
        <div key={label} className="flex justify-between text-slate-600">
          <dt>{label}</dt>
          <dd>{formatMoney(amount)}</dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold text-slate-900">
        <dt>Expected in drawer</dt>
        <dd>{formatMoney(summary.expected_cash)}</dd>
      </div>
      {checks !== 0 && (
        <div className="flex justify-between text-slate-500">
          <dt>Checks (not counted)</dt>
          <dd>{formatMoney(checks)}</dd>
        </div>
      )}
    </dl>
  );
}

function ClosedDrawerResult({ session }: { session: DrawerSession }) {
  const difference = overShort(session.counted_cash, session.expected_cash);
  return (
    <section role="status" className="space-y-1 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-slate-700">
      <p className="font-semibold text-green-800">Drawer closed.</p>
      <p>
        Counted {formatMoney(session.counted_cash ?? 0)}, expected {formatMoney(session.expected_cash ?? 0)}.
      </p>
      {difference !== null && <p className="font-semibold">{overShortLabel(difference)}</p>}
    </section>
  );
}
