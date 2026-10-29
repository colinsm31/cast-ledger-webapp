import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Customer, CustomerRacket, StringJob, StringJobStatus } from '../../types/domain';
import { customerName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { firstNumberProblem, parseNumberField } from '../../lib/numberInput';
import { Spinner } from '../../components/Spinner';
import { staffLabel, type StaffRef } from '../../lib/staff';
import { subCentError } from '../../lib/money';
import { PickOrAdd } from '../lookups/PickOrAdd';
import {
  cellClass,
  emptyRow,
  jobSideToRow,
  rowPayload,
  stringDims,
  toCatalogStrings,
  StringJobTable,
  resolveProduct,
  type AttributeDefRaw,
  type CatalogString,
  type RowSel,
  type StringProductRaw,
} from './stringJobForm';
import { jobRowProblems } from './stringRow';
import {
  STRING_CHANGE_METHODS,
  giveBackOverages,
  stringChangeEvents,
  type JobSaleLineRow,
  type StringChangeQuote,
} from './stringChange';
import { PaymentScreen, type Tender } from '../sales/PaymentScreen';

interface JobRow extends StringJob {
  customer_rackets:
    | (CustomerRacket & { customers: Customer | null })
    | null;
  entered_by_staff: StaffRef | null;
  completed_by_staff: StaffRef | null;
  delivered_by_staff: StaffRef | null;
  cancelled_by_staff: StaffRef | null;
  paid_sale: { id: string; sold_at: string; rung_by: StaffRef | null } | null;
  job_sale_lines: JobSaleLineRow[];
}

// A paid job's new strings, waiting for the difference to be settled.
interface PendingStringChange {
  quote: StringChangeQuote;
  mainProductId: string;
  crossProductId: string;
  mainTension: number;
  crossTension: number;
  notes: string | null;
}

// The job with its racket, owner, and the staff behind each status change.
const JOB_SELECT = [
  '*',
  'customer_rackets ( *, customers ( * ) )',
  'entered_by_staff:profiles!string_jobs_entered_by_fkey ( email )',
  'completed_by_staff:profiles!string_jobs_completed_by_fkey ( email )',
  'delivered_by_staff:profiles!string_jobs_delivered_by_fkey ( email )',
  'cancelled_by_staff:profiles!string_jobs_cancelled_by_fkey ( email )',
  'paid_sale:sales!string_jobs_paid_sale_id_fkey ( id, sold_at, rung_by:profiles!sales_user_id_fkey ( email ) )',
  'job_sale_lines:sale_lines ( kind, unit_price, sales ( id, sold_at, rung_by:profiles!sales_user_id_fkey ( email ) ), ' +
    'refund_lines ( kind, unit_price, refunds ( id, sale_id, refunded_at, refunded_by:profiles!refunds_user_id_fkey ( email ) ) ) )',
].join(', ');

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function StringJobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();

  const [job, setJob] = useState<JobRow | null>(null);
  const [catalog, setCatalog] = useState<CatalogString[]>([]);
  const [dims, setDims] = useState<string[]>([]);
  const [availableById, setAvailableById] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [mains, setMains] = useState<RowSel>(emptyRow);
  const [crosses, setCrosses] = useState<RowSel>(emptyRow);
  const [price, setPrice] = useState('');
  const [notes, setNotes] = useState('');
  const [strungBy, setStrungBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingChange, setPendingChange] = useState<PendingStringChange | null>(null);
  const [changeTenders, setChangeTenders] = useState<Tender[]>([]);
  const [changeReason, setChangeReason] = useState('');

  const hydrate = useCallback((j: JobRow) => {
    setJob(j);
    setMains(jobSideToRow(j.main_brand, j.main_string, j.main_specs, j.main_tension));
    setCrosses(jobSideToRow(j.cross_brand, j.cross_string, j.cross_specs, j.cross_tension));
    setPrice(j.price != null ? String(j.price) : '');
    setNotes(j.notes ?? '');
    setStrungBy(j.strung_by ?? '');
  }, []);

  // Moving to another job, an answer for the previous one is ignored (#37).
  const startRequest = useLatestRequest();

  useEffect(() => {
    if (!jobId) return;
    const isLatest = startRequest();
    void (async () => {
      const [jobRes, productsRes, attrsRes, availRes] = await Promise.all([
        supabase
          .from('string_jobs')
          .select(JOB_SELECT)
          .eq('id', jobId)
          .single(),
        supabase.from('products').select('id, brand, name, attributes, categories(name)').order('brand'),
        supabase.from('attribute_defs').select('name, sort_order, categories(name)').order('sort_order'),
        supabase.from('product_available').select('product_id, available'),
      ]);
      if (!isLatest()) return;
      // Without the catalog or what's available, the strings can't be shown
      // or checked, so any failure is a load error rather than an empty list (#36).
      const failure = jobRes.error ?? productsRes.error ?? attrsRes.error ?? availRes.error;
      if (failure) {
        setLoadError(errorMessage(failure));
        return;
      }
      hydrate(jobRes.data as unknown as JobRow);
      setDims(stringDims((attrsRes.data ?? []) as unknown as AttributeDefRaw[]));
      setCatalog(toCatalogStrings((productsRes.data ?? []) as unknown as StringProductRaw[]));
      const avail: Record<string, number> = {};
      for (const row of (availRes.data ?? []) as { product_id: string; available: number }[]) {
        avail[row.product_id] = Number(row.available);
      }
      setAvailableById(avail);
    })();
  }, [jobId, hydrate, startRequest]);

  const brands = useMemo(
    () => Array.from(new Set(catalog.map((c) => c.brand).filter(Boolean))).sort(),
    [catalog],
  );

  // Every column on both rows, while the strings can still change.
  const rowProblems = useMemo(
    () => (job?.status === 'entered' ? jobRowProblems(catalog, dims, mains, crosses) : []),
    [job?.status, catalog, dims, mains, crosses],
  );

  // Chosen strings with none available. A string this job already holds
  // counts its own set-aside unit as available.
  const unavailable = useMemo(() => {
    if (job?.status !== 'entered') return [];
    const held = new Set([job.main_product_id, job.cross_product_id].filter(Boolean));
    const out: { id: string; label: string }[] = [];
    for (const row of [mains, crosses]) {
      if (!row.name) continue;
      const product = resolveProduct(catalog, dims, row);
      if (!product || out.some((u) => u.id === product.id)) continue;
      const available = (availableById[product.id] ?? 0) + (held.has(product.id) ? 1 : 0);
      if (available <= 0) out.push({ id: product.id, label: `${product.brand ? `${product.brand} ` : ''}${product.name}` });
    }
    return out;
  }, [job, mains, crosses, catalog, dims, availableById]);

  async function reload() {
    if (!jobId) return;
    const isLatest = startRequest();
    const { data, error: err } = await supabase
      .from('string_jobs')
      .select(JOB_SELECT)
      .eq('id', jobId)
      .single();
    if (!isLatest()) return;
    if (err) setError(errorMessage(err));
    else hydrate(data as unknown as JobRow);
  }

  async function saveEdits() {
    if (!jobId || !job) return;
    // Strings are fixed once the racket is strung (the database refuses changes).
    const stringsEditable = job.status === 'entered';
    if (rowProblems.length > 0) {
      setError(rowProblems.join(' · '));
      return;
    }
    if (unavailable.length > 0) {
      setError(`${unavailable.map((u) => u.label).join(' and ')} — none available. Select a different string.`);
      return;
    }
    // A paid job's price is locked, so it's only checked while it can change.
    if (!job.paid_sale_id) {
      const priceProblem = firstNumberProblem(parseNumberField(price, 'Price')) ?? subCentError({ Price: price });
      if (priceProblem) {
        setError(priceProblem);
        return;
      }
    }
    setBusy(true);
    setError(null);

    // A paid job moving to strings of a different price settles the difference first.
    const mainProduct = stringsEditable ? resolveProduct(catalog, dims, mains) : undefined;
    const crossProduct = stringsEditable ? resolveProduct(catalog, dims, crosses) : undefined;
    const stringsMoved =
      !!mainProduct &&
      !!crossProduct &&
      (mainProduct.id !== job.main_product_id || crossProduct.id !== job.cross_product_id);
    if (job.paid_sale_id && stringsMoved && mainProduct && crossProduct) {
      const { data: quote, error: quoteErr } = await supabase.rpc('string_change_quote', {
        p_job_id: jobId,
        p_main_product_id: mainProduct.id,
        p_cross_product_id: crossProduct.id,
      });
      if (quoteErr) {
        setBusy(false);
        setError(errorMessage(quoteErr));
        return;
      }
      if ((quote as StringChangeQuote).direction !== 'none') {
        setBusy(false);
        setChangeTenders([]);
        setChangeReason('');
        setPendingChange({
          quote: quote as StringChangeQuote,
          mainProductId: mainProduct.id,
          crossProductId: crossProduct.id,
          mainTension: Number(mains.tension),
          crossTension: Number(crosses.tension),
          notes: notes.trim() || null,
        });
        return;
      }
    }

    const { error: err } = await supabase
      .from('string_jobs')
      .update({
        ...(stringsEditable
          ? { ...rowPayload(catalog, dims, mains, 'main'), ...rowPayload(catalog, dims, crosses, 'cross') }
          : {}),
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

  // Charge or give back the difference and change the strings, in one step.
  async function completeStringChange(change: PendingStringChange, tenders: Tender[]) {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('change_paid_string_job', {
      p_job_id: jobId,
      p_main_product_id: change.mainProductId,
      p_cross_product_id: change.crossProductId,
      p_main_tension: change.mainTension,
      p_cross_tension: change.crossTension,
      p_payments: tenders.map((t) => ({ method: t.method, amount: t.amount })),
      p_reason: changeReason.trim() || null,
    });
    if (!err && change.notes !== (job?.notes ?? null)) {
      await supabase.from('string_jobs').update({ notes: change.notes }).eq('id', jobId);
    }
    setBusy(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setPendingChange(null);
    setEditing(false);
    await reload();
  }

  // Persist the stringer immediately when picked. It's shown only once saved,
  // so "Mark complete" can't go ahead on a stringer that wasn't recorded (#42).
  async function setStringer(value: string) {
    if (!jobId) return;
    setError(null);
    const { data, error: err } = await supabase
      .from('string_jobs')
      .update({ strung_by: value.trim() || null })
      .eq('id', jobId)
      .select('strung_by')
      .single();
    if (err) {
      setError(`The stringer wasn't saved: ${errorMessage(err)}`);
      return;
    }
    setStrungBy((data as { strung_by: string | null }).strung_by ?? '');
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

  if (pendingChange) {
    const { quote } = pendingChange;
    const charging = quote.direction === 'charge';
    const overages = charging ? [] : giveBackOverages(changeTenders, quote.refundable ?? {});
    return (
      <PaymentScreen
        total={Number(quote.total)}
        customerId={quote.customer_id}
        busy={busy}
        error={error}
        giveBack={!charging}
        methods={STRING_CHANGE_METHODS}
        title={charging ? 'String change: customer owes' : 'String change: customer is owed'}
        backLabel="Back to the job"
        completeLabel={charging ? 'Charge & change strings' : 'Give back & change strings'}
        completeDisabled={overages.length > 0 && !changeReason.trim()}
        onTendersChange={setChangeTenders}
        onBack={() => {
          setPendingChange(null);
          setError(null);
        }}
        onComplete={(tenders) => void completeStringChange(pendingChange, tenders)}
      >
        <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <p>
            Strings ${Number(quote.old_price).toFixed(2)} → ${Number(quote.new_price).toFixed(2)}:{' '}
            {charging ? 'charge' : 'give back'} ${Number(quote.amount).toFixed(2)}
            {Number(quote.tax) > 0 ? ` + $${Number(quote.tax).toFixed(2)} tax` : ''}.
          </p>
          <p className="text-xs text-slate-500">The strings change once this is complete.</p>
          {!charging && (
            <p className="text-xs text-slate-500">
              Up to{' '}
              {STRING_CHANGE_METHODS.map(
                (m) => `${m === 'store_credit' ? 'store credit' : m} $${Number(quote.refundable?.[m] ?? 0).toFixed(2)}`,
              ).join(' · ')}{' '}
              without a reason (what the customer paid each way).
            </p>
          )}
        </section>
        {overages.length > 0 && (
          <label className="block space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <span className="text-sm text-amber-900">
              Giving back more as {overages.map((m) => (m === 'store_credit' ? 'store credit' : m)).join(' and ')} than
              the customer paid that way. Give a reason:
            </span>
            <input
              value={changeReason}
              onChange={(e) => setChangeReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        )}
      </PaymentScreen>
    );
  }

  const racket = job.customer_rackets;
  const customer = racket?.customers ?? null;
  const status = job.status;
  const cancelled = status === 'cancelled';
  // Entered: everything is editable. Complete: price (if unpaid) and notes only.
  const canEdit = status === 'entered' || status === 'complete';
  const editingStrings = editing && status === 'entered';

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
          {!editing && canEdit && (
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
          onMains={editingStrings ? (p) => setMains((prev) => ({ ...prev, ...p, specs: p.specs ?? prev.specs })) : undefined}
          onCrosses={editingStrings ? (p) => setCrosses((prev) => ({ ...prev, ...p, specs: p.specs ?? prev.specs })) : undefined}
          readOnly={!editingStrings}
        />

        {editing ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {!editingStrings && (
              <p className="w-full text-xs text-slate-500">
                The racquet has been strung, so its strings can&apos;t be changed.
              </p>
            )}
            {rowProblems.length > 0 && (
              <ul className="w-full space-y-0.5 text-xs text-amber-700">
                {rowProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
            {unavailable.length > 0 && (
              <p className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                {unavailable.map((u) => u.label).join(' and ')} {unavailable.length > 1 ? 'are' : 'is'} currently
                unavailable (none in stock or all committed to other jobs). Select a different string.
              </p>
            )}
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
                disabled={busy || rowProblems.length > 0 || unavailable.length > 0}
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
              {!job.paid_sale_id && (
                // Pay now, string later: the job stays entered once it's paid.
                <button
                  onClick={() => navigate(`/sales/new?stringJob=${job.id}`)}
                  disabled={busy}
                  className="rounded-lg border border-green-600 px-4 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
                >
                  Mark as paid
                </button>
              )}
              {job.paid_sale_id ? (
                // Refunds cover product lines only, so a paid job can't be cancelled.
                <p className="self-center text-sm text-slate-500">Paid jobs can&apos;t be cancelled.</p>
              ) : (
                <button
                  onClick={() => void cancelJob()}
                  disabled={busy}
                  className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Cancel job
                </button>
              )}
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
  const steps: { label: string; at: string | null; by: StaffRef | null; href?: string }[] = [
    ...stringChangeEvents(job.job_sale_lines ?? []),
    { label: 'Taken in', at: job.entered_at, by: job.entered_by_staff },
    {
      label: 'Paid',
      at: job.paid_sale?.sold_at ?? null,
      by: job.paid_sale?.rung_by ?? null,
      href: job.paid_sale ? `/sales/${job.paid_sale.id}` : undefined,
    },
    { label: 'Completed', at: job.completed_at, by: job.completed_by_staff },
    { label: 'Picked up', at: job.delivered_at, by: job.delivered_by_staff },
    { label: 'Cancelled', at: job.cancelled_at, by: job.cancelled_by_staff },
  ];
  const happened = steps
    .filter((step) => step.at)
    .sort((a, b) => new Date(a.at as string).getTime() - new Date(b.at as string).getTime());
  if (happened.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">History</h2>
      <dl className="divide-y divide-slate-100">
        {happened.map((step) => {
          const value = [new Date(step.at as string).toLocaleString(), staffLabel(step.by)].filter(Boolean).join(' · ');
          return step.href ? (
            <div key={`${step.label}-${step.at}`} className="flex justify-between py-1.5 text-sm">
              <dt className="text-slate-500">{step.label}</dt>
              <dd className="text-right">
                <Link to={step.href} className="text-blue-600 hover:underline">
                  {value}
                </Link>
              </dd>
            </div>
          ) : (
            <DetailRow key={`${step.label}-${step.at}`} label={step.label} value={value} />
          );
        })}
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
