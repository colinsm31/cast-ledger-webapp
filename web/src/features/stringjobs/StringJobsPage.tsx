import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { StringJob } from '../../types/domain';
import { customerName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { stringSummary } from './stringSummary';
import { useBack } from '../../app/BackContext';
import { PROMISE_STATE_CLASSES, promiseLabel, promiseState, sortOpenQueue } from '../../lib/stringJobPromise';
import { RushBadge } from './PromiseFields';
import { jobCode } from './jobTag';
import { UNASSIGNED, filterByStringer } from '../../lib/stringerWorkload';
import { useLookups } from '../lookups/useLookups';
import { WorkloadPanel } from './WorkloadPanel';

const STRINGER_FILTER_KEY = 'acestock.stringerFilter';

function rememberedFilter(): string {
  try {
    return window.localStorage.getItem(STRINGER_FILTER_KEY) ?? '';
  } catch {
    return '';
  }
}

// String job joined up to racket + customer for display in the queue.
interface JobRow extends StringJob {
  customer_rackets: {
    brand: string | null;
    model: string;
    barcode: string | null;
    customers: { id: string; first_name: string; last_name: string } | null;
  } | null;
}

const SELECT = `
  *,
  customer_rackets ( brand, model, barcode, customers ( id, first_name, last_name ) )
`;

export function StringJobsPage({
  status,
  title,
}: {
  status: 'entered' | 'complete';
  title: string;
}) {
  const navigate = useNavigate();
  useBack('/');
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The clock the due labels are measured against, moved on every minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // Waiting jobs can be narrowed to one stringer, remembered on this device (0064).
  const waitingQueue = status === 'entered';
  const [stringerFilter, setStringerFilter] = useState(rememberedFilter);
  const { values: stringerNames } = useLookups('stringer');
  const stringerOptions = useMemo(
    () =>
      Array.from(new Set([...stringerNames, ...(jobs ?? []).map((job) => job.assigned_to ?? '')].filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [stringerNames, jobs],
  );
  function chooseStringer(value: string) {
    setStringerFilter(value);
    try {
      window.localStorage.setItem(STRINGER_FILTER_KEY, value);
    } catch {
      // Not remembered; the filter still applies.
    }
  }
  const shown = jobs && waitingQueue ? filterByStringer(jobs, stringerFilter) : jobs;

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('string_jobs')
      .select(SELECT)
      .eq('status', status)
      .order('entered_at', { ascending: true });
    if (err) setError(errorMessage(err));
    else {
      const rows = (data ?? []) as unknown as JobRow[];
      // Waiting jobs: rush first, then the soonest promise (0063).
      setJobs(status === 'entered' ? sortOpenQueue(rows) : rows);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markDelivered(jobId: string) {
    setBusyId(jobId);
    setError(null);
    const { error: err } = await supabase.rpc('advance_string_job', {
      p_job_id: jobId,
      p_target_status: 'delivered',
    });
    setBusyId(null);
    if (err) setError(errorMessage(err));
    else await load();
  }

  const emptyMessage =
    status === 'entered'
      ? 'Newly entered re-strings appear here. Open one to record the stringer and mark it complete.'
      : 'Completed re-strings waiting to be picked up appear here.';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {waitingQueue && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Stringer
            <select
              value={stringerFilter}
              onChange={(e) => chooseStringer(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              <option value="">Everyone</option>
              {stringerOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value={UNASSIGNED}>Unassigned</option>
            </select>
          </label>
        )}
      </div>

      {waitingQueue && jobs && <WorkloadPanel waiting={jobs} now={now} />}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {jobs === null && !error && <Spinner label="Loading…" />}
      {jobs && jobs.length === 0 && <EmptyState title="Nothing here" message={emptyMessage} />}
      {jobs && jobs.length > 0 && shown && shown.length === 0 && (
        <p className="text-sm text-slate-500">No waiting jobs for this stringer.</p>
      )}
      {shown && shown.length > 0 && (
        <ul className="space-y-2">
          {shown.map((job) => {
            const racket = job.customer_rackets;
            const customer = racket?.customers;
            // Only a job still waiting to be strung can be late.
            const state = job.status === 'entered' ? promiseState(job.promised_at, now) : null;
            const dueLabel = state ? promiseLabel(job.promised_at, now) : null;
            return (
              <li
                key={job.id}
                onClick={() => navigate(`/string-jobs/${job.id}`)}
                className={`cursor-pointer rounded-xl border bg-white p-4 hover:border-blue-300 hover:bg-blue-50/40 ${
                  state === 'overdue' ? 'border-red-300' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      {customer ? (
                        <Link
                          to={`/customers/${customer.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-slate-900 hover:text-blue-700"
                        >
                          {customerName(customer)}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-900">—</span>
                      )}
                      <span className="text-xs font-semibold text-slate-500">{jobCode(job.job_number)}</span>
                      <StatusBadge status={job.status} />
                      <PaidBadge paid={!!job.paid_sale_id} />
                      {job.status === 'entered' && job.is_rush && <RushBadge />}
                    </div>
                    {state && dueLabel && <p className={`text-sm ${PROMISE_STATE_CLASSES[state]}`}>{dueLabel}</p>}
                    <p className="text-sm text-slate-500">
                      {racket ? `${racket.brand ? `${racket.brand} ` : ''}${racket.model}` : '—'}
                      {racket?.barcode ? ` · ${racket.barcode}` : ''}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{stringSummary(job)}</p>
                    {job.status === 'entered' && (
                      <p className="text-xs text-slate-500">
                        {job.assigned_to ? `Assigned to ${job.assigned_to}` : 'Unassigned'}
                      </p>
                    )}
                  </div>
                  {job.status === 'entered' && !job.paid_sale_id && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/sales/new?stringJob=${job.id}`);
                        }}
                        className="rounded-lg border border-green-600 px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50"
                      >
                        Mark as paid
                      </button>
                    </div>
                  )}
                  {job.status === 'complete' && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (job.paid_sale_id) void markDelivered(job.id);
                          else navigate(`/sales/new?stringJob=${job.id}&deliver=1`);
                        }}
                        disabled={busyId === job.id}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {job.paid_sale_id ? 'Mark delivered' : 'Take payment & deliver'}
                      </button>
                    </div>
                  )}
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
    cancelled: { label: 'Cancelled', classes: 'bg-slate-200 text-slate-600' },
  };
  const m = meta[status];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${m.classes}`}>{m.label}</span>
  );
}

function PaidBadge({ paid }: { paid: boolean }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        paid ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {paid ? 'Paid' : 'Unpaid'}
    </span>
  );
}
