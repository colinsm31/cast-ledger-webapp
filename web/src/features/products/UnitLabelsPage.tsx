import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { pageRule } from '../../lib/receiptLayout';
import { Barcode } from '../../components/Barcode';
import { Spinner } from '../../components/Spinner';
import { LoadError } from '../../components/LoadError';
import { fetchUnitLabels, type UnitLabel } from './unitLabel';

// Frame labels, one per page on the 80 mm printer (Phase 3B). Outside the
// app's frame, so only the labels print.
export function UnitLabelsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const idsParam = searchParams.get('ids') ?? '';
  const [labels, setLabels] = useState<UnitLabel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const startRequest = useLatestRequest();

  useEffect(() => {
    const ids = idsParam.split(',').map(decodeURIComponent).filter(Boolean);
    const isLatest = startRequest();
    setError(null);
    fetchUnitLabels(ids).then(
      (loaded) => {
        if (isLatest()) setLabels(loaded);
      },
      (err: unknown) => {
        if (isLatest()) setError(errorMessage(err));
      },
    );
  }, [idsParam, loadCount, startRequest]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <style>{pageRule('thermal')}</style>
      <div className="mx-auto mb-4 flex max-w-md flex-wrap items-center gap-2 print:hidden">
        <button onClick={() => navigate(-1)} className="text-sm text-blue-600 hover:underline">
          ← Back
        </button>
        <span className="text-sm text-slate-500">
          {labels ? `${labels.length} label${labels.length === 1 ? '' : 's'}` : ''}
        </span>
        <button
          onClick={() => window.print()}
          disabled={!labels || labels.length === 0}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Print labels
        </button>
      </div>
      {error ? (
        <div className="mx-auto max-w-md">
          <LoadError message={error} onRetry={() => setLoadCount((count) => count + 1)} />
        </div>
      ) : labels ? (
        labels.length === 0 ? (
          <p className="mx-auto max-w-md text-sm text-slate-600">None of these frames has a barcode to print.</p>
        ) : (
          <div className="mx-auto w-fit space-y-4 print:space-y-0">
            {labels.map((label) => (
              <div key={label.unitId} className="bg-white p-4 shadow print:break-after-page print:p-0 print:shadow-none">
                <UnitLabelView label={label} />
              </div>
            ))}
          </div>
        )
      ) : (
        <Spinner label="Loading the labels…" />
      )}
    </div>
  );
}

/** One frame's label. */
export function UnitLabelView({ label }: { label: UnitLabel }) {
  return (
    <article className="w-[72mm] space-y-1 font-sans text-[11pt] leading-snug text-black">
      <Barcode text={label.code} />
      <p className="text-center font-mono text-[12pt] font-bold tracking-wide">{label.code}</p>
      <p className="text-[12pt] font-semibold">{label.title}</p>
      {label.details && <p>{label.details}</p>}
      {label.price != null && <p className="font-semibold">${label.price.toFixed(2)}</p>}
    </article>
  );
}
