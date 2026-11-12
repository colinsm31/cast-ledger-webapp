import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { fetchReceipt, type Receipt } from '../../lib/receipt';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import {
  chooseLayout,
  pageRule,
  rememberedLayout,
  rememberLayout,
  RECEIPT_LAYOUTS,
  type ReceiptLayout,
} from '../../lib/receiptLayout';
import { Spinner } from '../../components/Spinner';
import { LoadError } from '../../components/LoadError';
import { ReceiptView } from './ReceiptView';

// A sale's receipt, ready to print or reprint. Outside the app's frame, so
// only the receipt prints; the toolbar is hidden when printing.
export function ReceiptPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const layout = chooseLayout(searchParams.get('layout'), rememberedLayout());
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const startRequest = useLatestRequest();

  useEffect(() => {
    if (!saleId) return;
    const isLatest = startRequest();
    setError(null);
    fetchReceipt(saleId).then(
      (loaded) => {
        if (isLatest()) setReceipt(loaded);
      },
      (err: unknown) => {
        if (isLatest()) setError(errorMessage(err));
      },
    );
  }, [saleId, loadCount, startRequest]);

  function chooseAndRemember(next: ReceiptLayout) {
    rememberLayout(next);
    setSearchParams({ layout: next }, { replace: true });
  }

  function print() {
    rememberLayout(layout);
    window.print();
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{pageRule(layout)}</style>
      <div className="mx-auto mb-4 flex max-w-2xl flex-wrap items-center gap-2 print:hidden">
        <Link to={`/sales/${saleId}`} className="text-sm text-blue-600 hover:underline">
          ← Back to the sale
        </Link>
        <div className="ml-auto flex gap-1 rounded-lg border border-slate-300 bg-white p-1" role="group" aria-label="Layout">
          {RECEIPT_LAYOUTS.map((option) => (
            <button
              key={option.value}
              onClick={() => chooseAndRemember(option.value)}
              aria-pressed={layout === option.value}
              className={`rounded px-3 py-1 text-sm ${
                layout === option.value ? 'bg-blue-600 font-semibold text-white' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          onClick={print}
          disabled={!receipt}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Print
        </button>
      </div>
      {error ? (
        <div className="mx-auto max-w-2xl">
          <LoadError message={error} onRetry={() => setLoadCount((count) => count + 1)} />
        </div>
      ) : receipt ? (
        <div className="bg-white p-4 shadow print:p-0 print:shadow-none">
          <ReceiptView receipt={receipt} layout={layout} />
        </div>
      ) : (
        <Spinner label="Loading the receipt…" />
      )}
    </div>
  );
}
