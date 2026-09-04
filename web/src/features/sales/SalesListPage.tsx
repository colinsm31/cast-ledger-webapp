import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { customerNameLastFirst } from '../../types/domain';
import { useSettings } from '../../lib/settings';
import { useBack } from '../../app/BackContext';
import { Spinner } from '../../components/Spinner';

type Period = 'today' | 'wtd' | 'mtd' | 'ytd' | 'custom';
type Tab = 'summary' | 'tickets';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'wtd', label: 'Week to date' },
  { value: 'mtd', label: 'Month to date' },
  { value: 'ytd', label: 'Year to date' },
  { value: 'custom', label: 'Custom range' },
];

interface Summary {
  gross: number;
  tax: number;
  refunds: number;
  net: number;
  card: number;
  cash: number;
  check_amt: number;
  store_credit: number;
  gift_card: number;
  num_customers: number;
  num_tickets: number;
  num_items: number;
}

interface TicketRow {
  id: string;
  sold_at: string;
  subtotal: number;
  customers: { first_name: string; last_name: string } | null;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}
const money = (v: number) => `$${Number(v).toFixed(2)}`;

export function SalesListPage() {
  const navigate = useNavigate();
  const settings = useSettings();
  const weekStartsMonday = settings?.week_starts_monday ?? false;
  useBack('/');
  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [tab, setTab] = useState<Tab>('summary');

  const [summary, setSummary] = useState<Summary | null>(null);
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve the selected period to a [from, to) range.
  const range = useMemo(() => {
    const now = new Date();
    if (period === 'today') return { from: startOfDay(now), to: now };
    if (period === 'wtd') {
      // Offset back to the start of the week (Sunday or Monday).
      const dow = now.getDay(); // 0=Sun
      const back = weekStartsMonday ? (dow + 6) % 7 : dow;
      return { from: addDays(startOfDay(now), -back), to: now };
    }
    if (period === 'mtd') return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    if (period === 'ytd') return { from: new Date(now.getFullYear(), 0, 1), to: now };
    // custom
    const f = parseLocalDate(customFrom);
    const t = parseLocalDate(customTo);
    if (!f || !t) return null;
    return { from: f, to: addDays(t, 1) }; // end date inclusive
  }, [period, customFrom, customTo, weekStartsMonday]);

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
    setError(null);
    void (async () => {
      const [sumRes, tixRes] = await Promise.all([
        supabase.rpc('sales_summary', { p_from: fromISO, p_to: toISO }),
        supabase
          .from('sales')
          .select('id, sold_at, subtotal, customers ( first_name, last_name )')
          .gte('sold_at', fromISO)
          .lt('sold_at', toISO)
          .order('sold_at', { ascending: false }),
      ]);
      if (sumRes.error) setError(errorMessage(sumRes.error));
      else {
        const row = Array.isArray(sumRes.data) ? sumRes.data[0] : sumRes.data;
        setSummary(row ? normalizeSummary(row) : null);
      }
      if (!tixRes.error) setTickets((tixRes.data ?? []) as unknown as TicketRow[]);
    })();
  }, [range]);

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

      {/* Period */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              period === p.value
                ? 'bg-blue-600 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">From</span>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="block rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">To</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="block rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>Summary</TabButton>
        <TabButton active={tab === 'tickets'} onClick={() => setTab('tickets')}>Tickets</TabButton>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {period === 'custom' && !range && (
        <p className="text-sm text-slate-500">Choose a start and end date.</p>
      )}

      {tab === 'summary' && range && (
        summary === null && !error ? (
          <Spinner label="Loading…" />
        ) : summary ? (
          <section className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            <MoneyRow label="Gross receipts" value={summary.gross} />
            <MoneyRow label="Sales tax collected" value={summary.tax} />
            <MoneyRow label="Total refunds issued" value={summary.refunds} />
            <MoneyRow label="Total net receipts" value={summary.net} strong />
            <MoneyRow label="Net credit/debit card receipts" value={summary.card} />
            <MoneyRow label="Net cash receipts" value={summary.cash} />
            <MoneyRow label="Net receipts paid by check" value={summary.check_amt} />
            <MoneyRow label="Net store credit issued (redeemed) in sales transactions" value={summary.store_credit} />
            <MoneyRow label="Net purchases made with gift cards/certificates" value={summary.gift_card} />
            <CountRow label="Number of customers" value={summary.num_customers} />
            <CountRow label="Number of sales tickets" value={summary.num_tickets} />
            <CountRow label="Number of items sold" value={summary.num_items} />
          </section>
        ) : null
      )}

      {tab === 'tickets' && range && (
        tickets === null && !error ? (
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
                  <span className="font-semibold text-slate-900">{money(sale.subtotal)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

function normalizeSummary(r: Record<string, unknown>): Summary {
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    gross: n('gross'),
    tax: n('tax'),
    refunds: n('refunds'),
    net: n('net'),
    card: n('card'),
    cash: n('cash'),
    check_amt: n('check_amt'),
    store_credit: n('store_credit'),
    gift_card: n('gift_card'),
    num_customers: n('num_customers'),
    num_tickets: n('num_tickets'),
    num_items: n('num_items'),
  };
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
function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
        active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
