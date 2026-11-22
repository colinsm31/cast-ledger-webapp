import { Link } from 'react-router-dom';
import { demoLoanLabel, demoOutcome } from '../../lib/demoLoans';
import { customerNameLastFirst } from '../../types/domain';
import { frameRacquetName, type LoanWithFrame } from './demoLoanQueries';

// MARK: - DemoHistoryList
//
// Demo loans as history: the racquet and frame, when it went out and came
// back, how it came back, and the sale it led to (0072). The customer's name
// shows when the list mixes customers.
export function DemoHistoryList({ loans, showCustomer }: { loans: LoanWithFrame[]; showCustomer: boolean }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {loans.map((loan) => (
        <li key={loan.id} className="space-y-0.5 px-4 py-3 text-sm">
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
            {loan.sale_id ? (
              <Link
                to={`/sales/${loan.sale_id}`}
                className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 hover:underline"
              >
                Bought
              </Link>
            ) : (
              <span className="text-xs text-slate-500">{demoOutcome(loan)}</span>
            )}
          </div>
          <p className="text-slate-600">
            {showCustomer && loan.customers && (
              <>
                <Link to={`/customers/${loan.customers.id}`} className="text-blue-600 hover:underline">
                  {customerNameLastFirst(loan.customers)}
                </Link>
                {' · '}
              </>
            )}
            {'Out '}
            {new Date(loan.out_at).toLocaleDateString()}
            {loan.back_at ? ` · back ${new Date(loan.back_at).toLocaleDateString()}` : ' · still out'}
            {/* "Bought" stands in for the outcome; say so if the demo came back damaged. */}
            {loan.sale_id && loan.back_status === 'retired' ? ' · retired' : ''}
            {loan.back_reason ? ` · “${loan.back_reason}”` : ''}
          </p>
        </li>
      ))}
    </ul>
  );
}
