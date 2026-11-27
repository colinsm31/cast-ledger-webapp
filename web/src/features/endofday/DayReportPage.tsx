import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LoadError } from '../../components/LoadError';
import { PrintToolbar, usePrintLayout } from '../../components/PrintToolbar';
import { Spinner } from '../../components/Spinner';
import { fetchDayReport, type DayReport } from '../../lib/dayReport';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { useSettings } from '../../lib/settings';
import { DayReportView } from './DayReportView';

// A business day's report, ready to print. Outside the app's frame, like a
// receipt, so only the report prints.
export function DayReportPage() {
  const { day } = useParams<{ day: string }>();
  const { settings } = useSettings();
  const { layout, choose, print } = usePrintLayout();
  const [report, setReport] = useState<DayReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const startRequest = useLatestRequest();

  useEffect(() => {
    if (!day) return;
    const isLatest = startRequest();
    setError(null);
    fetchDayReport(day).then(
      (loaded) => {
        if (isLatest()) setReport(loaded);
      },
      (err: unknown) => {
        if (isLatest()) setError(errorMessage(err));
      },
    );
  }, [day, loadCount, startRequest]);

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <PrintToolbar
        backTo="/end-of-day"
        backLabel="Back to end of day"
        layout={layout}
        onChoose={choose}
        onPrint={print}
        canPrint={Boolean(report)}
      />
      {error ? (
        <div className="mx-auto max-w-2xl">
          <LoadError message={error} onRetry={() => setLoadCount((count) => count + 1)} />
        </div>
      ) : report ? (
        <div className="bg-white p-4 shadow print:p-0 print:shadow-none">
          <DayReportView report={report} layout={layout} shopName={settings?.shop_name ?? null} />
        </div>
      ) : (
        <Spinner label="Loading the daily report…" />
      )}
    </div>
  );
}
