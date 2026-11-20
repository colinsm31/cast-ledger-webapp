import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { fetchAllRowsResult } from '../../lib/paging';
import type { Customer, CustomerRacket } from '../../types/domain';
import { customerName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { useSettings } from '../../lib/settings';
import { LoadError } from '../../components/LoadError';
import { hasSubCent } from '../../lib/money';
import { useBack } from '../../app/BackContext';
import { Spinner } from '../../components/Spinner';
import {
  cellClass,
  emptyRow,
  resolveProduct,
  rowPayload,
  stringDims,
  toCatalogStrings,
  StringJobTable,
  type AttributeDefRaw,
  type CatalogString,
  type RowSel,
  type StringProductRaw,
} from '../stringjobs/stringJobForm';
import { jobRowProblems } from '../stringjobs/stringRow';
import { PromiseFields } from '../stringjobs/PromiseFields';
import { PickOrAdd } from '../lookups/PickOrAdd';
import { defaultPromise, fromLocalInput, promiseProblem, toLocalInput } from '../../lib/stringJobPromise';

import { SETUP_COLUMNS, setupToRows } from '../stringjobs/lastSetup';
import { LastSetupPanel, type LastSetup } from '../stringjobs/LastSetupPanel';
import type { StringSetup } from '../stringjobs/stringSummary';

type PastJob = StringSetup & {
  entered_at: string;
  customer_rackets: { brand: string | null; model: string } | null;
};

export function NewStringJobPage() {
  const { customerId, racketId } = useParams<{ customerId: string; racketId: string }>();
  const navigate = useNavigate();
  const { settings, error: settingsError, reload: reloadSettings } = useSettings();
  useBack(customerId ? `/customers/${customerId}` : '/customers');

  const [racket, setRacket] = useState<CustomerRacket | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [catalog, setCatalog] = useState<CatalogString[]>([]);
  const [dims, setDims] = useState<string[]>([]);
  const [availableById, setAvailableById] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  // A racquet can have only one open (entered or complete) job at a time.
  const [openJobId, setOpenJobId] = useState<string | null>(null);

  const [mains, setMains] = useState<RowSel>(emptyRow);
  const [crosses, setCrosses] = useState<RowSel>(emptyRow);
  // Crosses mirror the mains string (and tension) until the user edits them.
  const [crossStringEdited, setCrossStringEdited] = useState(false);
  const [crossTensionEdited, setCrossTensionEdited] = useState(false);
  const [manualPrice, setManualPrice] = useState('');
  const [payNow, setPayNow] = useState(false);
  // Print the job's tag straight after entering it (unless paying first).
  const [printTag, setPrintTag] = useState(true);
  // Empty until the settings load, then the shop's default turnaround.
  const [promised, setPromised] = useState('');
  const [rush, setRush] = useState(false);
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Same as last time": this racquet's last job, and the customer's last job
  // on another racquet.
  const [racketLast, setRacketLast] = useState<PastJob | null>(null);
  const [customerLast, setCustomerLast] = useState<PastJob | null>(null);

  useEffect(() => {
    if (!racketId) return;
    void (async () => {
      const [racketRes, customerRes, productsRes, attrsRes, lastJobRes, availRes, openJobRes, customerLastRes] =
        await Promise.all([
        supabase.from('customer_rackets').select('*').eq('id', racketId).single(),
        customerId
          ? supabase.from('customers').select('*').eq('id', customerId).single()
          : Promise.resolve({ data: null, error: null }),
        // Every product and its availability, not just the first 1000 (#5).
        fetchAllRowsResult('products', 'id, brand, name, attributes, sell_price, categories(name)', ['brand', 'id']),
        supabase.from('attribute_defs').select('name, sort_order, categories(name)').order('sort_order'),
        supabase
          .from('string_jobs')
          .select(`${SETUP_COLUMNS}, entered_at, customer_rackets ( brand, model )`)
          .eq('customer_racket_id', racketId)
          .neq('status', 'cancelled')
          .order('entered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        fetchAllRowsResult('product_available', 'product_id, available', 'product_id'),
        supabase
          .from('string_jobs')
          .select('id')
          .eq('customer_racket_id', racketId)
          .in('status', ['entered', 'complete'])
          .limit(1)
          .maybeSingle(),
        customerId
          ? supabase
              .from('string_jobs')
              .select(`${SETUP_COLUMNS}, entered_at, customer_rackets!inner ( brand, model, customer_id )`)
              .eq('customer_rackets.customer_id', customerId)
              .neq('customer_racket_id', racketId)
              .neq('status', 'cancelled')
              .order('entered_at', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (racketRes.error) {
        setLoadError(errorMessage(racketRes.error));
        return;
      }
      setRacket(racketRes.data as CustomerRacket);
      setOpenJobId((openJobRes.data as { id: string } | null)?.id ?? null);
      if (customerRes.data) setCustomer(customerRes.data as Customer);
      setDims(stringDims((attrsRes.data ?? []) as unknown as AttributeDefRaw[]));
      setCatalog(toCatalogStrings((productsRes.data ?? []) as unknown as StringProductRaw[]));

      const avail: Record<string, number> = {};
      for (const row of (availRes.data ?? []) as { product_id: string; available: number }[]) {
        avail[row.product_id] = Number(row.available);
      }
      setAvailableById(avail);

      // Start from the racquet's last setup, if it has one.
      const last = lastJobRes.data as unknown as PastJob | null;
      setRacketLast(last);
      setCustomerLast(customerLastRes.data as unknown as PastJob | null);
      if (last) applySetup(last);
    })();
  }, [racketId, customerId]);

  // Fill both rows from a past job's setup.
  function applySetup(job: StringSetup) {
    const rows = setupToRows(job);
    setMains(rows.mains);
    setCrosses(rows.crosses);
    setCrossStringEdited(rows.crossStringEdited);
    setCrossTensionEdited(rows.crossTensionEdited);
  }

  const lastSetups: LastSetup[] = [
    ...(racketLast ? [{ key: 'racket', label: 'Last time on this racquet', job: racketLast }] : []),
    ...(customerLast
      ? [{ key: 'customer', label: `Last time on ${racketName(customerLast.customer_rackets)}`, job: customerLast }]
      : []),
  ];

  useEffect(() => {
    if (settings && !promised) setPromised(toLocalInput(defaultPromise(new Date(), settings.stringing_turnaround_hours)));
  }, [settings, promised]);
  const promisedProblem = promised ? promiseProblem(promised, new Date()) : null;

  const brands = useMemo(
    () => Array.from(new Set(catalog.map((c) => c.brand).filter(Boolean))).sort(),
    [catalog],
  );

  function updateMains(patch: Partial<RowSel>) {
    const next = { ...mains, ...patch, specs: patch.specs ?? mains.specs };
    setMains(next);
    setCrosses((c) => {
      const nc = { ...c };
      if (!crossStringEdited) {
        nc.brand = next.brand;
        nc.name = next.name;
        nc.specs = { ...next.specs };
        nc.customer = next.customer;
      }
      if (!crossTensionEdited) nc.tension = next.tension;
      return nc;
    });
  }

  function updateCrosses(patch: Partial<RowSel>) {
    if (patch.tension !== undefined) setCrossTensionEdited(true);
    if (patch.brand !== undefined || patch.name !== undefined || patch.specs !== undefined || patch.customer !== undefined) {
      setCrossStringEdited(true);
    }
    setCrosses((prev) => ({ ...prev, ...patch }));
  }

  // Chosen strings whose available stock (on-hand minus committed) is depleted.
  const unavailable = useMemo(() => {
    const out: { id: string; label: string }[] = [];
    for (const row of [mains, crosses]) {
      if (!row.name) continue;
      const product = resolveProduct(catalog, dims, row);
      if (!product) continue;
      const avail = availableById[product.id] ?? 0;
      if (avail <= 0 && !out.some((u) => u.id === product.id)) {
        out.push({ id: product.id, label: `${product.brand ? `${product.brand} ` : ''}${product.name}` });
      }
    }
    return out;
  }, [mains, crosses, availableById, catalog, dims]);

  // Price = base labor charge + the distinct string products' own prices (a
  // hybrid uses one of each). Not manually entered unless it comes to $0.
  const autoPrice = useMemo(() => {
    const seen = new Set<string>();
    let sum = settings?.stringing_labor ?? 0;
    for (const row of [mains, crosses]) {
      if (!row.name) continue;
      const product = resolveProduct(catalog, dims, row);
      if (product && !seen.has(product.id)) {
        seen.add(product.id);
        sum += product.sellPrice ?? 0;
      }
    }
    return sum;
  }, [mains, crosses, catalog, dims, settings]);

  // Every column (brand, string, each string attribute, tension) on both rows.
  const rowProblems = useMemo(() => jobRowProblems(catalog, dims, mains, crosses), [catalog, dims, mains, crosses]);

  // When the chosen strings have no price ($0), the user must enter one. The
  // price is only known once both rows name a specific catalog string.
  const stringsChosen = rowProblems.length === 0;
  const needsManualPrice = stringsChosen && autoPrice <= 0;
  const manualPriceValid = Number(manualPrice) > 0 && !hasSubCent(manualPrice);
  const price = needsManualPrice ? (manualPriceValid ? Number(manualPrice) : 0) : autoPrice;

  async function save() {
    if (!racketId) return;
    if (rowProblems.length > 0) {
      setError(rowProblems.join(' · '));
      return;
    }
    if (unavailable.length > 0) {
      setError(
        `${unavailable.map((u) => u.label).join(' and ')} ${
          unavailable.length > 1 ? 'are' : 'is'
        } currently unavailable — select a different string.`,
      );
      return;
    }
    if (needsManualPrice && !manualPriceValid) {
      setError('This string has no set price — enter a price (whole cents) before entering the stringing.');
      return;
    }
    const promisedAt = fromLocalInput(promised);
    const promiseError = promiseProblem(promised, new Date());
    if (promiseError || !promisedAt) {
      setError(promiseError ?? 'Choose when the job will be ready.');
      return;
    }
    setSaving(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('string_jobs')
      .insert({
        customer_racket_id: racketId,
        status: 'entered',
        ...rowPayload(catalog, dims, mains, 'main'),
        ...rowPayload(catalog, dims, crosses, 'cross'),
        price: price > 0 ? price : null,
        promised_at: promisedAt.toISOString(),
        is_rush: rush,
        assigned_to: assignedTo.trim() || null,
      })
      .select('id')
      .single();
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    // Pay now → open a sales ticket for the stringing in the customer's name.
    if (payNow && data) {
      navigate(`/sales/new?stringJob=${data.id}`);
    } else if (printTag && data) {
      navigate(`/string-jobs/${data.id}/tag`);
    } else {
      navigate(`/customers/${customerId}`);
    }
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!racket) return <Spinner label="Loading…" />;

  // The database refuses both of these; say so before the form is filled in.
  if (!racket.is_active || openJobId) {
    return (
      <div className="max-w-3xl space-y-4">
        <h1 className="text-xl font-bold text-slate-900">
          {customer ? customerName(customer) : 'New string job'}
        </h1>
        <p className="text-sm text-slate-700">
          {!racket.is_active
            ? `${racketLabel(racket)} has been retired, so it can't get a new string job.`
            : `${racketLabel(racket)} already has an open string job. Finish or deliver it before entering a new one.`}
        </p>
        <div className="flex gap-2">
          {openJobId && racket.is_active && (
            <button
              onClick={() => navigate(`/string-jobs/${openJobId}`)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Open the current job
            </button>
          )}
          <button
            onClick={() => navigate(customerId ? `/customers/${customerId}` : '/customers')}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            Back to customer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">
          {customer ? customerName(customer) : 'New string job'}
        </h1>
        <p className="text-sm text-slate-500">
          {racket.brand ? `${racket.brand} ` : ''}
          {racket.model}
          {racket.grip_size ? ` · grip ${racket.grip_size}` : ''}
          {racket.barcode ? ` · ${racket.barcode}` : ''}
        </p>
      </div>

      <LastSetupPanel setups={lastSetups} onUse={applySetup} />

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <StringJobTable
          dims={dims}
          brands={brands}
          catalog={catalog}
          mains={mains}
          crosses={crosses}
          onMains={updateMains}
          onCrosses={updateCrosses}
        />
        <p className="mt-2 text-xs text-slate-400">
          Pick a string from the catalog, or tick Own when the customer brought their own (labor only). Crosses copy
          the mains string and tension automatically — change the crosses row only for a hybrid or a different cross
          tension.
        </p>
        {rowProblems.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-amber-700">
            {rowProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        {unavailable.length > 0 && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {unavailable.map((u) => u.label).join(' and ')}{' '}
            {unavailable.length > 1 ? 'are' : 'is'} currently unavailable (none in stock or all
            committed to other jobs). Select a different string.
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">
            {needsManualPrice ? 'Price' : 'Price (from string)'}
          </span>
          {needsManualPrice ? (
            <input
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0.00"
              className={`${cellClass} w-28 text-right`}
            />
          ) : (
            <span className="text-lg font-semibold text-slate-900">{stringsChosen ? `$${price.toFixed(2)}` : '—'}</span>
          )}
        </div>
        {needsManualPrice && (
          <p className="mt-2 text-xs text-amber-700">
            This string has no set price — enter a price to continue.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <PromiseFields
          promised={promised}
          rush={rush}
          problem={promisedProblem}
          onPromised={setPromised}
          onRush={setRush}
        />
        <label className="mt-3 block max-w-xs space-y-1">
          <span className="text-xs font-medium text-slate-500">Assign to</span>
          <PickOrAdd kind="stringer" value={assignedTo} onChange={setAssignedTo} placeholder="Unassigned" />
        </label>
      </section>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
        Pay now (open a sales ticket after entering)
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={printTag} onChange={(e) => setPrintTag(e.target.checked)} disabled={payNow} />
        Print the job tag next{payNow ? ' (print it from the job after payment, marked PAID)' : ''}
      </label>

      {/* The price includes the stringing labor charge from the settings. */}
      {!settings && settingsError && <LoadError message={settingsError} onRetry={reloadSettings} />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void save()}
          disabled={
            saving ||
            !settings ||
            rowProblems.length > 0 ||
            unavailable.length > 0 ||
            (needsManualPrice && !manualPriceValid) ||
            !!promisedProblem
          }
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Enter string job'}
        </button>
        <button onClick={() => navigate(`/customers/${customerId}`)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function racketName(racket: { brand: string | null; model: string } | null): string {
  return racket ? `${racket.brand ? `${racket.brand} ` : ''}${racket.model}` : 'another racquet';
}

function racketLabel(racket: CustomerRacket): string {
  return `${racket.brand ? `${racket.brand} ` : ''}${racket.model}`;
}
