import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchReceipt, type Receipt } from '../../lib/receipt';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { PrintToolbar, usePrintLayout } from '../../components/PrintToolbar';
import { Spinner } from '../../components/Spinner';
import { LoadError } from '../../components/LoadError';
import { ReceiptView } from './ReceiptView';

// A sale's receipt, ready to print or reprint. Outside the app's frame, so
// only the receipt prints; the toolbar is hidden when printing.
export function ReceiptPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const { layout, choose, print } = usePrintLayout();
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

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <PrintToolbar
        backTo={`/sales/${saleId}`}
        backLabel="Back to the sale"
        layout={layout}
        onChoose={choose}
        onPrint={print}
        canPrint={Boolean(receipt)}
      />
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
