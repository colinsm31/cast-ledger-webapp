import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { customerNameLastFirst } from '../../types/domain';
import { useSettings } from '../../lib/settings';
import { LoadError } from '../../components/LoadError';
import { useBack } from '../../app/BackContext';
import { Spinner } from '../../components/Spinner';
import { useLatestRequest } from '../../lib/latestRequest';
import { formatDateTime } from '../../lib/dates';
import { usePeriodRange } from '../../lib/reportPeriod';
import { PeriodPicker } from '../../components/PeriodPicker';
import { TabButton } from '../../components/TabButton';
import { CsvButton } from '../../components/CsvButton';
import { csvFileName, downloadCsv } from '../../lib/csv';
import { normalizeSummary, SUMMARY_ROWS, summaryCsv, ticketsCsv, type Summary, type TicketRow } from './salesListData';

type Tab = 'summary' | 'tickets';

const money = (v: number) => `$${Number(v).toFixed(2)}`;

export function SalesListPage() {
  const navigate = useNavigate();
  const { settings, error: settingsError, reload: reloadSettings } = useSettings();
  const weekStartsMonday = settings?.week_starts_monday ?? false;
  useBack('/');
  const periodState = usePeriodRange(weekStartsMonday);
  const { range } = periodState;
  const [tab, setTab] = useState<Tab>('summary');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  // Each tab's own load error, shown with Retry (a failed tickets load used to
  // spin forever, code review #36).
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const retry = () => setLoadCount((count) => count + 1);
  const startRequest = useLatestRequest();

  useEffect(() => {
    if (!range) {
      setSummary(null);
      setTickets(null);
      return;
    }
    const fromISO = range.from.toISOString();
    const toISO = range.to.toISOString();
    setSummary(null);
    setTickets(null);
    setSummaryError(null);
    setTicketsError(null);
    // A slow answer for an earlier period never replaces the one chosen since (#37).
    const isLatest = startRequest();
    void (async () => {
      const [sumRes, tixRes] = await Promise.all([
        supabase.rpc('sales_summary', { p_from: fromISO, p_to: toISO }),
        supabase
          .from('sales')
          .select('id, sold_at, subtotal, tax, customers ( first_name, last_name )')
          .gte('sold_at', fromISO)
          .lt('sold_at', toISO)
          .order('sold_at', { ascending: false }),
      ]);
      if (!isLatest()) return;
      if (sumRes.error) setSummaryError(`Couldn't load the summary: ${errorMessage(sumRes.error)}`);
      else {
        const row = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
        setSummary(row ? normalizeSummary(row) : null);
      }
      if (tixRes.error) setTicketsError(`Couldn't load the tickets: ${errorMessage(tixRes.error)}`);
      else setTickets((tixRes.data ?? []) as unknown as TicketRow[]);
    })();
  }, [range, loadCount, startRequest]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Sales</h1>
        <Link
          to="/sales/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New sale
        </Link>
      </div>

      {!settings && settingsError && <LoadError message={settingsError} onRetry={reloadSettings} />}

      <PeriodPicker state={periodState} />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>Summary</TabButton>
        <TabButton active={tab === 'tickets'} onClick={() => setTab('tickets')}>Tickets</TabButton>
        <div className="ml-auto pb-1">
          <CsvButton
            disabled={!range || (tab === 'summary' ? !summary : !tickets || tickets.length === 0)}
            onClick={() => {
              if (!range) return;
              if (tab === 'summary' && summary) {
                downloadCsv(csvFileName('sales-summary', range), summaryCsv(summary));
              } else if (tab === 'tickets' && tickets) {
                downloadCsv(csvFileName('sales-tickets', range), ticketsCsv(tickets));
              }
            }}
          />
        </div>
      </div>

      {tab === 'summary' && range && (
        summaryError ? (
          <LoadError message={summaryError} onRetry={retry} />
        ) : summary === null ? (
          <Spinner label="Loading…" />
        ) : summary ? (
          <section className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {SUMMARY_ROWS.map((row) =>
              row.kind === 'count' ? (
                <CountRow key={row.key} label={row.label} value={summary[row.key]} />
              ) : (
                <MoneyRow key={row.key} label={row.label} value={summary[row.key]} strong={row.strong} />
              ),
            )}
            <p className="p-3 text-xs text-slate-500">
              Gift cards count as sales when they're spent, not when they're sold. Net receipts include
              gift cards sold, so they match the money taken in.
            </p>
          </section>
        ) : null
      )}

      {tab === 'tickets' && range && (
        ticketsError ? (
          <LoadError message={ticketsError} onRetry={retry} />
        ) : tickets === null ? (
          <Spinner label="Loading…" />
        ) : tickets && tickets.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No sales in this period.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {(tickets ?? []).map((sale) => (
              <li key={sale.id}>
                <button
                  onClick={() => navigate(`/sales/${sale.id}`)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {sale.customers ? customerNameLastFirst(sale.customers) : 'Unidentified Customer'}
                    </p>
                    <p className="text-xs text-slate-500">{formatDateTime(sale.sold_at)}</p>
                  </div>
                  {/* The total the customer paid, tax included (#38). */}
                  <span className="font-semibold text-slate-900">{money(Number(sale.subtotal) + Number(sale.tax))}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function MoneyRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <span className={`text-sm ${strong ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>{label}</span>
      <span className={`tabular-nums ${strong ? 'text-lg font-bold text-slate-900' : 'font-medium text-slate-900'}`}>
        {money(value)}
      </span>
    </div>
  );
}
function CountRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="font-medium tabular-nums text-slate-900">{value}</span>
    </div>
  );
}
