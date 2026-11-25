import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { conversionSummary, demoLoanLabel, overdueCount, sortOpenLoans } from '../../lib/demoLoans';
import { PROMISE_STATE_CLASSES, promiseLabel, promiseState } from '../../lib/stringJobPromise';
import { customerNameLastFirst } from '../../types/domain';
import { Spinner } from '../../components/Spinner';
import { LoadError } from '../../components/LoadError';
import { EmptyState } from '../../components/EmptyState';
import { useBack } from '../../app/BackContext';
import { DemoLoanActions } from './DemoLoanActions';
import { DemoHistoryList } from './DemoHistoryList';
import { CsvButton } from '../../components/CsvButton';
import { downloadCsv } from '../../lib/csv';
import { demoLoansCsv, demoLoansFileName } from './demoLoansCsv';
import {
  fetchOpenLoans,
  fetchReturnedLoans,
  frameRacquetName,
  RETURNED_LIMIT,
  type LoanWithFrame,
} from './demoLoanQueries';

type DemosTab = 'out' | 'returned';

// MARK: - DemosPage
//
// Demos out now, and demos that have come back with which led to a sale.
export function DemosPage() {
  useBack('/');
  const [tab, setTab] = useState<DemosTab>('out');
  const tabClass = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium ${active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setTab('out')} className={tabClass(tab === 'out')}>
          Out now
        </button>
        <button onClick={() => setTab('returned')} className={tabClass(tab === 'returned')}>
          Returned
        </button>
      </div>
      {tab === 'out' ? <OpenLoansView /> : <ReturnedLoansView />}
    </div>
  );
}

// MARK: - OpenLoansView
//
// The demo frames out with customers, the one due back soonest (or most
// overdue) first. A scan or typed text narrows the list to a frame, loan
// number or customer, so a demo coming back is found in one scan.
function OpenLoansView() {
  const [loans, setLoans] = useState<LoanWithFrame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const startRequest = useLatestRequest();

  const load = useCallback(async () => {
    const isLatest = startRequest();
    setError(null);
    try {
      const found = sortOpenLoans(await fetchOpenLoans());
      if (isLatest()) setLoans(found);
    } catch (err) {
      if (isLatest()) setError(errorMessage(err));
    }
  }, [startRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !loans) return <LoadError message={error} onRetry={() => void load()} />;
  if (!loans) return <Spinner />;

  const now = new Date();
  const overdue = overdueCount(loans, now);
  const shown = loans.filter((loan) => matchesFilter(loan, filter));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Demos out</h1>
        <CsvButton disabled={shown.length === 0} onClick={() => downloadCsv(demoLoansFileName('out'), demoLoansCsv(shown))} />
        <p className="text-sm text-slate-600">
          <span className="font-semibold">{loans.length}</span> out
          {overdue > 0 && (
            <>
              {' · '}
              <span className="font-semibold text-red-700">{overdue} overdue</span>
            </>
          )}
        </p>
      </div>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Scan a frame, or type a loan number or customer…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}

      {shown.length === 0 ? (
        <EmptyState
          title={loans.length === 0 ? 'No demos are out' : 'Nothing matches'}
          message={
            loans.length === 0
              ? 'Lend a frame from the demo fleet on its racquet’s page.'
              : 'Check the barcode, loan number or name.'
          }
        />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {shown.map((loan) => {
            const state = promiseState(loan.due_back_at, now);
            return (
              <li key={loan.id} className="space-y-1 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-slate-500">{demoLoanLabel(loan)}</span>
                    <Link
                      to={`/products/${loan.product_units?.product_id ?? ''}`}
                      className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                    >
                      {frameRacquetName(loan)}
                    </Link>
                    <span className="font-mono text-xs text-slate-500">{loan.product_units?.barcode ?? 'No barcode'}</span>
                  </div>
                  <span className={state ? PROMISE_STATE_CLASSES[state] : ''}>{promiseLabel(loan.due_back_at, now)}</span>
                </div>
                <p className="text-slate-600">
                  {loan.customers ? (
                    <Link to={`/customers/${loan.customers.id}`} className="text-blue-600 hover:underline">
                      {customerNameLastFirst(loan.customers)}
                    </Link>
                  ) : (
                    'Customer'
                  )}
                  {loan.customers?.phone_number ? ` · ${loan.customers.phone_number}` : ''}
                  {' · out '}
                  {new Date(loan.out_at).toLocaleDateString()}
                  {loan.deposit_note ? ` · Deposit: ${loan.deposit_note}` : ''}
                  {loan.note ? ` · “${loan.note}”` : ''}
                </p>
                <DemoLoanActions loan={loan} onChanged={load} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// MARK: - ReturnedLoansView
//
// The latest demos checked in, and how many led to a sale.
function ReturnedLoansView() {
  const [loans, setLoans] = useState<LoanWithFrame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startRequest = useLatestRequest();

  const load = useCallback(async () => {
    const isLatest = startRequest();
    setError(null);
    try {
      const found = await fetchReturnedLoans();
      if (isLatest()) setLoans(found);
    } catch (err) {
      if (isLatest()) setError(errorMessage(err));
    }
  }, [startRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <LoadError message={error} onRetry={() => void load()} />;
  if (!loans) return <Spinner />;
  if (loans.length === 0) return <EmptyState title="No demos have come back yet" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">Demos returned</h1>
        <CsvButton onClick={() => downloadCsv(demoLoansFileName('returned'), demoLoansCsv(loans))} />
        <p className="text-sm text-slate-600">
          {conversionSummary(loans)}
          {loans.length === RETURNED_LIMIT ? ` (latest ${RETURNED_LIMIT})` : ''}
        </p>
      </div>
      <DemoHistoryList loans={loans} showCustomer />
    </div>
  );
}

// MARK: - Private Helpers

function matchesFilter(loan: LoanWithFrame, filter: string): boolean {
  const text = filter.trim().toLowerCase();
  if (!text) return true;
  const fields = [
    demoLoanLabel(loan),
    loan.product_units?.barcode ?? '',
    loan.customers ? `${loan.customers.first_name} ${loan.customers.last_name}` : '',
    loan.customers?.phone_number ?? '',
    frameRacquetName(loan),
  ];
  return fields.some((field) => field.toLowerCase().includes(text));
}
