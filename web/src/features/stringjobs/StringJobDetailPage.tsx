import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Customer, CustomerRacket, StringJob, StringJobStatus } from '../../types/domain';
import { customerName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { staffLabel, type StaffRef } from '../../lib/staff';
import { PickOrAdd } from '../lookups/PickOrAdd';
import {
  cellClass,
  emptyRow,
  jobSideToRow,
  rowPayload,
  stringDims,
  toCatalogStrings,
  StringJobTable,
  type AttributeDefRaw,
  type CatalogString,
  type RowSel,
  type StringProductRaw,
} from './stringJobForm';

interface JobRow extends StringJob {
  customer_rackets:
    | (CustomerRacket & { customers: Customer | null })
    | null;
  entered_by_staff: StaffRef | null;
  completed_by_staff: StaffRef | null;
  delivered_by_staff: StaffRef | null;
  cancelled_by_staff: StaffRef | null;
}

// The job with its racket, owner, and the staff behind each status change.
const JOB_SELECT = [
  '*',
  'customer_rackets ( *, customers ( * ) )',
  'entered_by_staff:profiles!string_jobs_entered_by_fkey ( email )',
  'completed_by_staff:profiles!string_jobs_completed_by_fkey ( email )',
  'delivered_by_staff:profiles!string_jobs_delivered_by_fkey ( email )',
  'cancelled_by_staff:profiles!string_jobs_cancelled_by_fkey ( email )',
].join(', ');

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function StringJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobRow | null>(null);
  const [catalog, setCatalog] = useState<CatalogString[]>([]);
  const [dims, setDims] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [mains, setMains] = useState<RowSel>(emptyRow);
  const [crosses, setCrosses] = useState<RowSel>(emptyRow);
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [strungBy, setStrungBy] = useState('');
  const [busy, setBusy] = useState(false);

  const hydrate = useCallback((j: JobRow) => {
    setJob(j);
    setMains(jobSideToRow(j.main_brand, j.main_string, j.main_specs, j.main_tension));
    setCrosses(jobSideToRow(j.cross_brand, j.cross_string, j.cross_specs, j.cross_tension));
    setPrice(j.price != null ? String(j.price) : '');
    setNotes(j.notes ?? '');
    setStrungBy(j.strung_by ?? '');
  }, []);

  useEffect(() => {
    if (!jobId) return;
    void (async () => {
      const [jobRes, productsRes, attrsRes] = await Promise.all([
        supabase
          .from('string_jobs')
          .select(JOB_SELECT)
          .eq('id', jobId)
          .single(),
        supabase.from('products').select('id, brand, name, attributes, categories(name)').order('brand'),
        supabase.from('attribute_defs').select('name, sort_order, categories(name)').order('sort_order'),
      ]);
      if (jobRes.error) {
        setLoadError(errorMessage(jobRes.error));
        return;
      }
      hydrate(jobRes.data as unknown as JobRow);
      setDims(stringDims((attrsRes.data ?? []) as unknown as AttributeDefRaw[]));
      setCatalog(toCatalogStrings((productsRes.data ?? []) as unknown as StringProductRaw[]));
    })();
  }, [jobId, hydrate]);

  const brands = useMemo(
    () => Array.from(new Set(catalog.map((c) => c.brand).filter(Boolean))).sort(),
    [catalog],
  );

  async function reload() {
    if (!jobId) return;
    const { data, error: err } = await supabase
      .from('string_jobs')
      .select(JOB_SELECT)
      .eq('id', jobId)
      .single();
    if (err) setError(errorMessage(err));
    else hydrate(data as unknown as JobRow);
  }

  async function saveEdits() {
    if (!jobId || !job) return;
    if (!mains.name) {
      setError('Choose the mains string');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase
      .from('string_jobs')
      .update({
        ...rowPayload(catalog, dims, mains, 'main'),
        ...rowPayload(catalog, dims, crosses, 'cross'),
        // A paid job's price is locked (the database refuses changes).
        ...(job.paid_sale_id ? {} : { price: price ? Number(price) : null }),
        notes: notes.trim() || null,
      })
      .eq('id', jobId);
    setBusy(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setEditing(false);
    await reload();
  }

  // Persist the stringer immediately when picked.
  async function setStringer(value: string) {
    setStrungBy(value);
    if (!jobId) return;
    const { error: err } = await supabase
      .from('string_jobs')
      .update({ strung_by: value.trim() || null })
      .eq('id', jobId);
    if (err) setError(errorMessage(err));
  }

  async function advance(target: StringJobStatus) {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('advance_string_job', {
      p_job_id: jobId,
      p_target_status: target,
    });
    setBusy(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    // Delivered jobs live under the customer, not on their own page.
    if (target === 'delivered') {
      const customerId = job?.customer_rackets?.customer_id;
      navigate(customerId ? `/customers/${customerId}` : '/string-jobs/open');
      return;
    }
    await reload();
  }

  async function cancelJob() {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('cancel_string_job', { p_job_id: jobId });
    setBusy(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    const customerId = job?.customer_rackets?.customer_id;
    navigate(customerId ? `/customers/${customerId}` : '/string-jobs');
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!job) return <Spinner label="Loading…" />;

  const racket = job.customer_rackets;
  const customer = racket?.customers ?? null;
  const status = job.status;
  const cancelled = status === 'cancelled';

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        {customer && (
          <button
            onClick={() => navigate(`/customers/${customer.id}`)}
            className="text-sm text-blue-600 hover:underline"
          >
            ‹ {customerName(customer)}
          </button>
        )}
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-slate-900">{customer ? customerName(customer) : 'String job'}</h1>
          <StatusBadge status={status} />
          {status !== 'cancelled' && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                job.paid_sale_id ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {job.paid_sale_id ? 'Paid' : 'Unpaid'}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500">
          {racket?.brand ? `${racket.brand} ` : ''}
          {racket?.model}
          {racket?.grip_size ? ` · grip ${racket.grip_size}` : ''}
          {racket?.barcode ? ` · ${racket.barcode}` : ''}
        </p>
      </div>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Strings</h2>
          {!editing && !cancelled && status !== 'delivered' && (
            <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline">
              Edit
            </button>
          )}
        </div>
        <StringJobTable
          dims={dims}
          brands={brands}
          catalog={catalog}
          mains={mains}
          crosses={crosses}
          onMains={editing ? (p) => setMains((prev) => ({ ...prev, ...p, specs: p.specs ?? prev.specs })) : undefined}
          onCrosses={editing ? (p) => setCrosses((prev) => ({ ...prev, ...p, specs: p.specs ?? prev.specs })) : undefined}
          readOnly={!editing}
        />

        {editing ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="block flex-1 min-w-[8rem] space-y-1">
              <span className="text-xs font-medium text-slate-500">Price</span>
              {job.paid_sale_id ? (
                <p className="py-2 text-sm text-slate-700">
                  ${job.price != null ? job.price.toFixed(2) : '0.00'} · paid, so the price is locked
                </p>
              ) : (
                <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={cellClass} />
              )}
            </label>
            <label className="block w-full space-y-1">
              <span className="text-xs font-medium text-slate-500">Notes</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cellClass} />
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => void saveEdits()}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  void reload();
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <dl className="mt-3 divide-y divide-slate-100">
            {job.price != null && <DetailRow label="Price" value={`$${job.price.toFixed(2)}`} />}
            {job.notes && <DetailRow label="Notes" value={job.notes} />}
          </dl>
        )}
      </section>

      {/* Stringer — recorded when the racket is strung (entered jobs). */}
      {status === 'entered' && !editing && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
          <span className="text-xs font-medium text-slate-500">Strung by</span>
          <PickOrAdd kind="stringer" value={strungBy} onChange={(v) => void setStringer(v)} placeholder="Who strung it?" />
        </section>
      )}
      {status !== 'entered' && job.strung_by && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <span className="text-slate-500">Strung by </span>
          <span className="font-medium text-slate-800">{job.strung_by}</span>
        </section>
      )}

      <JobHistory job={job} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Lifecycle actions */}
      {!editing && (
        <div className="flex flex-wrap gap-2">
          {status === 'entered' && (
            <>
              <button
                onClick={() => void advance('complete')}
                disabled={busy || !strungBy.trim()}
                title={!strungBy.trim() ? 'Record who strung it first' : undefined}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Mark complete
              </button>
              <button
                onClick={() => void cancelJob()}
                disabled={busy}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Cancel job
              </button>
            </>
          )}
          {status === 'complete' && (
            <button
              onClick={() =>
                job.paid_sale_id
                  ? void advance('delivered')
                  : navigate(`/sales/new?stringJob=${job.id}&deliver=1`)
              }
              disabled={busy}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {job.paid_sale_id ? 'Mark delivered' : 'Take payment & deliver'}
            </button>
          )}
          {(status === 'delivered' || cancelled) && (
            <p className="text-sm text-slate-500">
              This job is {titleCase(status)} — no further actions.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// When each status change happened and which staff member made it.
function JobHistory({ job }: { job: JobRow }) {
  const steps: { label: string; at: string | null; by: StaffRef | null }[] = [
    { label: 'Taken in', at: job.entered_at, by: job.entered_by_staff },
    { label: 'Completed', at: job.completed_at, by: job.completed_by_staff },
    { label: 'Picked up', at: job.delivered_at, by: job.delivered_by_staff },
    { label: 'Cancelled', at: job.cancelled_at, by: job.cancelled_by_staff },
  ];
  const happened = steps.filter((step) => step.at);
  if (happened.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">History</h2>
      <dl className="divide-y divide-slate-100">
        {happened.map((step) => (
          <DetailRow
            key={step.label}
            label={step.label}
            value={[new Date(step.at as string).toLocaleString(), staffLabel(step.by)].filter(Boolean).join(' · ')}
          />
        ))}
      </dl>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta: Record<string, string> = {
    entered: 'bg-orange-100 text-orange-800',
    complete: 'bg-blue-100 text-blue-800',
    delivered: 'bg-green-100 text-green-800',
    cancelled: 'bg-slate-200 text-slate-600',
  };
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta[status] ?? 'bg-slate-100 text-slate-700'}`}>
      {label}
    </span>
  );
}
