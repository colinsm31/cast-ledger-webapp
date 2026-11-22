import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/errors';
import { conversionSummary } from '../../lib/demoLoans';
import { Spinner } from '../../components/Spinner';
import { DemoHistoryList } from './DemoHistoryList';
import { fetchCustomerLoans, type LoanWithFrame } from './demoLoanQueries';

// MARK: - CustomerDemosPanel
//
// Every demo a customer has borrowed, newest first, and which led to a sale.
export function CustomerDemosPanel({ customerId }: { customerId: string }) {
  const [loans, setLoans] = useState<LoanWithFrame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchCustomerLoans(customerId).then(
      (found) => active && setLoans(found),
      (err: unknown) => active && setError(errorMessage(err)),
    );
    return () => {
      active = false;
    };
  }, [customerId]);

  const summary = loans ? conversionSummary(loans) : null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Demos</h2>
        {summary && <span className="text-sm text-slate-500">{summary}</span>}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loans === null && !error && <Spinner label="Loading…" />}
      {loans && loans.length === 0 && <p className="text-sm text-slate-500">This customer hasn’t borrowed a demo.</p>}
      {loans && loans.length > 0 && <DemoHistoryList loans={loans} showCustomer={false} />}
    </section>
  );
}
