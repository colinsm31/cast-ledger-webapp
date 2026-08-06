import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { StringJob } from '../../types/domain';
import { customerName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { stringSummary } from './stringSummary';

// String job joined up to racket + customer for display in the queue.
interface JobRow extends StringJob {
  customer_rackets: {
    brand: string | null;
    model: string;
    label: string | null;
    customers: { id: string; first_name: string; last_name: string } | null;
  } | null;
}

const SELECT = `
  *,
  customer_rackets ( brand, model, label, customers ( id, first_name, last_name ) )
`;

export function StringJobsPage() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Active queue = not yet delivered, oldest first.
    const { data, error: err } = await supabase
      .from('string_jobs')
      .select(SELECT)
      .neq('status', 'delivered')
      .order('entered_at', { ascending: true });
    if (err) setError(errorMessage(err));
    else setJobs((data ?? []) as unknown as JobRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function advance(jobId: string, target: 'complete' | 'delivered') {
    setBusyId(jobId);
    setError(null);
    const { error: err } = await supabase.rpc('advance_string_job', {
      p_job_id: jobId,
      p_target_status: target,
    });
    setBusyId(null);
    if (err) setError(errorMessage(err));
    else await load();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">String jobs</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {jobs === null && !error && <Spinner label="Loading…" />}
      {jobs && jobs.length === 0 && (
        <EmptyState title="No active jobs" message="Entered and completed string jobs show here until delivered." />
      )}
      {jobs && jobs.length > 0 && (
        <ul className="space-y-2">
          {jobs.map((job) => {
            const racket = job.customer_rackets;
            const customer = racket?.customers;
            return (
              <li key={job.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {customer ? (
                        <Link to={`/customers/${customer.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                          {customerName(customer)}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">—</span>
                      )}
                      <StatusBadge status={job.status} />
                    </div>
                    <p className="text-sm text-slate-500">
                      {racket ? `${racket.brand ? `${racket.brand} ` : ''}${racket.model}` : '—'}
                      {racket?.label ? ` · ${racket.label}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{stringSummary(job)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {job.status === 'entered' && (
                      <button
                        onClick={() => void advance(job.id, 'complete')}
                        disabled={busyId === job.id}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Mark complete
                      </button>
                    )}
                    {job.status === 'complete' && (
                      <button
                        onClick={() => void advance(job.id, 'delivered')}
                        disabled={busyId === job.id}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        Mark delivered
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: StringJob['status'] }) {
  const meta: Record<StringJob['status'], { label: string; classes: string }> = {
    entered: { label: 'Entered', classes: 'bg-orange-100 text-orange-800' },
    complete: { label: 'Complete', classes: 'bg-blue-100 text-blue-800' },
    delivered: { label: 'Delivered', classes: 'bg-green-100 text-green-800' },
  };
  const m = meta[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.classes}`}>{m.label}</span>
  );
}
