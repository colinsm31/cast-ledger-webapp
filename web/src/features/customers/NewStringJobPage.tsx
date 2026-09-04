import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Customer, CustomerRacket } from '../../types/domain';
import { customerName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { useSettings } from '../../lib/settings';
import { useBack } from '../../app/BackContext';
import { Spinner } from '../../components/Spinner';
import {
  cellClass,
  emptyRow,
  jobSideToRow,
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

interface LastJob {
  main_brand: string | null;
  main_string: string | null;
  main_specs: Record<string, unknown> | null;
  main_tension: number | null;
  cross_brand: string | null;
  cross_string: string | null;
  cross_specs: Record<string, unknown> | null;
  cross_tension: number | null;
}

export function NewStringJobPage() {
  const { customerId, racketId } = useParams<{ customerId: string; racketId: string }>();
  const navigate = useNavigate();
  const settings = useSettings();
  useBack(customerId ? `/customers/${customerId}` : '/customers');

  const [racket, setRacket] = useState<CustomerRacket | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [catalog, setCatalog] = useState<CatalogString[]>([]);
  const [dims, setDims] = useState<string[]>([]);
  const [availableById, setAvailableById] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mains, setMains] = useState<RowSel>(emptyRow);
  const [crosses, setCrosses] = useState<RowSel>(emptyRow);
  // Crosses mirror the mains string (and tension) until the user edits them.
  const [crossStringEdited, setCrossStringEdited] = useState(false);
  const [crossTensionEdited, setCrossTensionEdited] = useState(false);
  const [manualPrice, setManualPrice] = useState('');
  const [payNow, setPayNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!racketId) return;
    void (async () => {
      const [racketRes, customerRes, productsRes, attrsRes, lastJobRes, availRes] = await Promise.all([
        supabase.from('customer_rackets').select('*').eq('id', racketId).single(),
        customerId
          ? supabase.from('customers').select('*').eq('id', customerId).single()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('products').select('id, brand, name, attributes, sell_price, categories(name)').order('brand'),
        supabase.from('attribute_defs').select('name, sort_order, categories(name)').order('sort_order'),
        supabase
          .from('string_jobs')
          .select('main_brand, main_string, main_specs, main_tension, cross_brand, cross_string, cross_specs, cross_tension')
          .eq('customer_racket_id', racketId)
          .order('entered_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('product_available').select('product_id, available'),
      ]);
      if (racketRes.error) {
        setLoadError(errorMessage(racketRes.error));
        return;
      }
      setRacket(racketRes.data as CustomerRacket);
      if (customerRes.data) setCustomer(customerRes.data as Customer);
      setDims(stringDims((attrsRes.data ?? []) as unknown as AttributeDefRaw[]));
      setCatalog(toCatalogStrings((productsRes.data ?? []) as unknown as StringProductRaw[]));

      const avail: Record<string, number> = {};
      for (const row of (availRes.data ?? []) as { product_id: string; available: number }[]) {
        avail[row.product_id] = Number(row.available);
      }
      setAvailableById(avail);

      // Preload from the racket's last string job, if any.
      const last = lastJobRes.data as LastJob | null;
      if (last) {
        const mainsDraft = jobSideToRow(last.main_brand, last.main_string, last.main_specs, last.main_tension);
        const crossesDraft = jobSideToRow(last.cross_brand, last.cross_string, last.cross_specs, last.cross_tension);
        setMains(mainsDraft);
        if (!crossesDraft.name) {
          setCrosses(mainsDraft);
        } else {
          setCrosses(crossesDraft);
          const sameString =
            mainsDraft.brand === crossesDraft.brand &&
            mainsDraft.name === crossesDraft.name &&
            JSON.stringify(mainsDraft.specs) === JSON.stringify(crossesDraft.specs);
          if (!sameString) setCrossStringEdited(true);
          if (mainsDraft.tension !== crossesDraft.tension) setCrossTensionEdited(true);
        }
      }
    })();
  }, [racketId, customerId]);

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
      }
      if (!crossTensionEdited) nc.tension = next.tension;
      return nc;
    });
  }

  function updateCrosses(patch: Partial<RowSel>) {
    if (patch.tension !== undefined) setCrossTensionEdited(true);
    if (patch.brand !== undefined || patch.name !== undefined || patch.specs !== undefined) {
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

  // When the chosen string has no price ($0), the user must enter one.
  const needsManualPrice = !!mains.name && autoPrice <= 0;
  const manualPriceValid = Number(manualPrice) > 0;
  const price = needsManualPrice ? (manualPriceValid ? Number(manualPrice) : 0) : autoPrice;

  async function save() {
    if (!racketId) return;
    if (!mains.name) {
      setError('Choose the mains string');
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
      setError('This string has no set price — enter a price before entering the stringing.');
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
    } else {
      navigate(`/customers/${customerId}`);
    }
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!racket) return <Spinner label="Loading…" />;

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
          Pick a string from the catalog. Crosses copy the mains string and tension automatically —
          change the crosses row only for a hybrid or a different cross tension.
        </p>
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
            <span className="text-lg font-semibold text-slate-900">${price.toFixed(2)}</span>
          )}
        </div>
        {needsManualPrice && (
          <p className="mt-2 text-xs text-amber-700">
            This string has no set price — enter a price to continue.
          </p>
        )}
      </section>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
        Pay now (open a sales ticket after entering)
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void save()}
          disabled={saving || unavailable.length > 0 || (needsManualPrice && !manualPriceValid)}
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
