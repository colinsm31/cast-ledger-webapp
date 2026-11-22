import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../lib/errors';
import { demoLoanLabel, overdueCount, sortOpenLoans } from '../../lib/demoLoans';
import { PROMISE_STATE_CLASSES, promiseLabel, promiseState } from '../../lib/stringJobPromise';
import { customerNameLastFirst } from '../../types/domain';
import { Spinner } from '../../components/Spinner';
import { LoadError } from '../../components/LoadError';
import { EmptyState } from '../../components/EmptyState';
import { useBack } from '../../app/BackContext';
import { DemoLoanActions } from './DemoLoanActions';
import { fetchOpenLoans, frameRacquetName, type LoanWithFrame } from './demoLoanQueries';

// MARK: - DemosPage
//
// The demo frames out with customers, the one due back soonest (or most
// overdue) first. A scan or typed text narrows the list to a frame, loan
// number or customer, so a demo coming back is found in one scan.
export function DemosPage() {
  useBack('/');
  const [loans, setLoans] = useState<LoanWithFrame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setLoans(sortOpenLoans(await fetchOpenLoans()));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

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
