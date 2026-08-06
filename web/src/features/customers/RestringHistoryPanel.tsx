import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { StringJob } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { stringSummary } from '../stringjobs/stringSummary';

// Delivered string jobs for a customer's rackets, newest first.
interface DeliveredJob extends StringJob {
  customer_rackets: { brand: string | null; model: string; label: string | null } | null;
}

const SELECT = `
  *,
  customer_rackets!inner ( brand, model, label, customer_id )
`;

export function RestringHistoryPanel({ customerId }: { customerId: string }) {
  const [jobs, setJobs] = useState<DeliveredJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('string_jobs')
        .select(SELECT)
        .eq('status', 'delivered')
        .eq('customer_rackets.customer_id', customerId)
        .order('delivered_at', { ascending: false });
      if (err) setError(errorMessage(err));
      else setJobs((data ?? []) as unknown as DeliveredJob[]);
    })();
  }, [customerId]);

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">Re-stringing history</h2>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {jobs === null && !error && <Spinner label="Loading…" />}
      {jobs && jobs.length === 0 && (
        <p className="text-sm text-slate-500">
          No delivered string jobs yet. Jobs appear here once marked delivered.
        </p>
      )}
      {jobs && jobs.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {jobs.map((job) => (
            <li key={job.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-slate-800">
                    {job.customer_rackets
                      ? `${job.customer_rackets.brand ? `${job.customer_rackets.brand} ` : ''}${job.customer_rackets.model}`
                      : '—'}
                    {job.customer_rackets?.label ? (
                      <span className="text-slate-400"> · {job.customer_rackets.label}</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-slate-600">{stringSummary(job)}</p>
                  {(job.strung_by || job.notes) && (
                    <p className="mt-1 text-xs text-slate-500">
                      {job.strung_by ? `By ${job.strung_by}` : ''}
                      {job.strung_by && job.notes ? ' · ' : ''}
                      {job.notes ?? ''}
                    </p>
                  )}
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>{formatDate(job.delivered_at)}</p>
                  {job.price != null && <p className="text-slate-900">${job.price.toFixed(2)}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}
