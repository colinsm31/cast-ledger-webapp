import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { CustomerRacket, JsonValue } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';

const cellClass =
  'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

// A string product from the catalog. Each product is now a unique item, so its
// own attributes (gauge, color, …) fully describe the string.
interface CatalogString {
  id: string;
  brand: string;
  name: string;
  attributes: Record<string, string>;
}

interface StringProductRaw {
  id: string;
  brand: string | null;
  name: string;
  attributes: Record<string, JsonValue> | null;
  categories: { name: string } | null;
}

// One row's selection (mains or crosses).
interface RowSel {
  brand: string;
  productId: string;
  tension: string;
}

const emptyRow: RowSel = { brand: '', productId: '', tension: '' };

// Human-readable attribute summary for a chosen string product (e.g. "16 · Black").
function attributeSummary(product: CatalogString | undefined): string {
  if (!product) return '';
  return Object.values(product.attributes)
    .filter((v) => v != null && v !== '')
    .join(' · ');
}

export function NewStringJobPage() {
  const { customerId, racketId } = useParams<{ customerId: string; racketId: string }>();
  const navigate = useNavigate();

  const [racket, setRacket] = useState<CustomerRacket | null>(null);
  const [catalog, setCatalog] = useState<CatalogString[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [mains, setMains] = useState<RowSel>(emptyRow);
  const [crosses, setCrosses] = useState<RowSel>(emptyRow);
  // Crosses mirror the mains string (and tension) until the user edits them —
  // most jobs use one string, so this saves re-entering it.
  const [crossStringEdited, setCrossStringEdited] = useState(false);
  const [crossTensionEdited, setCrossTensionEdited] = useState(false);
  const [price, setPrice] = useState('');
  const [strungBy, setStrungBy] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!racketId) return;
    void (async () => {
      const [racketRes, productsRes] = await Promise.all([
        supabase.from('customer_rackets').select('*').eq('id', racketId).single(),
        supabase
          .from('products')
          .select('id, brand, name, attributes, categories(name)')
          .order('brand'),
      ]);
      if (racketRes.error) {
        setLoadError(errorMessage(racketRes.error));
        return;
      }
      setRacket(racketRes.data as CustomerRacket);

      const strings: CatalogString[] = ((productsRes.data ?? []) as unknown as StringProductRaw[])
        .filter((p) => p.categories?.name === 'Strings')
        .map((p) => {
          const attributes: Record<string, string> = {};
          for (const [k, v] of Object.entries(p.attributes ?? {})) {
            if (v != null && v !== '') attributes[k] = String(v);
          }
          return { id: p.id, brand: p.brand ?? '', name: p.name, attributes };
        });
      setCatalog(strings);
    })();
  }, [racketId]);

  // Distinct string brands (sorted).
  const brands = useMemo(
    () => Array.from(new Set(catalog.map((c) => c.brand).filter(Boolean))).sort(),
    [catalog],
  );

  function updateMains(patch: Partial<RowSel>) {
    const next = { ...mains, ...patch };
    setMains(next);
    // Mirror into crosses until each side has been edited independently.
    setCrosses((c) => {
      const nc = { ...c };
      if (!crossStringEdited) {
        nc.brand = next.brand;
        nc.productId = next.productId;
      }
      if (!crossTensionEdited) {
        nc.tension = next.tension;
      }
      return nc;
    });
  }

  function updateCrosses(patch: Partial<RowSel>) {
    if (patch.tension !== undefined) setCrossTensionEdited(true);
    if (patch.brand !== undefined || patch.productId !== undefined) {
      setCrossStringEdited(true);
    }
    setCrosses((prev) => ({ ...prev, ...patch }));
  }

  function rowPayload(row: RowSel, prefix: 'main' | 'cross') {
    const product = catalog.find((c) => c.id === row.productId);
    if (!product) {
      return {
        [`${prefix}_product_id`]: null,
        [`${prefix}_brand`]: null,
        [`${prefix}_string`]: null,
        [`${prefix}_specs`]: {},
        [`${prefix}_tension`]: row.tension ? Number(row.tension) : null,
      };
    }
    return {
      [`${prefix}_product_id`]: product.id,
      [`${prefix}_brand`]: product.brand || row.brand || null,
      [`${prefix}_string`]: product.name,
      [`${prefix}_specs`]: product.attributes,
      [`${prefix}_tension`]: row.tension ? Number(row.tension) : null,
    };
  }

  async function save() {
    if (!racketId) return;
    if (!mains.productId) {
      setError('Choose the mains string');
      return;
    }
    setSaving(true);
    setError(null);

    const { error: err } = await supabase.from('string_jobs').insert({
      customer_racket_id: racketId,
      status: 'entered',
      ...rowPayload(mains, 'main'),
      ...rowPayload(crosses, 'cross'),
      price: price ? Number(price) : null,
      strung_by: strungBy.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    navigate(`/customers/${customerId}`);
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!racket) return <Spinner label="Loading…" />;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">New string job</h1>
        <p className="text-sm text-slate-500">
          {racket.brand ? `${racket.brand} ` : ''}
          {racket.model}
          {racket.grip_size ? ` · grip ${racket.grip_size}` : ''}
          {racket.label ? ` · ${racket.label}` : ''}
        </p>
      </div>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <table className="w-full border-separate border-spacing-x-2 border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase text-slate-500">
              <th></th>
              <th>Brand</th>
              <th>String</th>
              <th>Details</th>
              <th>Tension</th>
            </tr>
          </thead>
          <tbody>
            <StringRowInputs label="Mains" row={mains} onChange={updateMains} brands={brands} catalog={catalog} />
            <StringRowInputs label="Crosses" row={crosses} onChange={updateCrosses} brands={brands} catalog={catalog} />
          </tbody>
        </table>
        <p className="mt-2 text-xs text-slate-400">
          Pick a string from the catalog. Crosses copy the mains string and tension automatically —
          change the crosses row only for a hybrid or a different cross tension.
        </p>
      </section>

      <section className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block flex-1 min-w-[8rem] space-y-1">
          <span className="text-xs font-medium text-slate-500">Price</span>
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={cellClass} />
        </label>
        <label className="block flex-1 min-w-[8rem] space-y-1">
          <span className="text-xs font-medium text-slate-500">Strung by</span>
          <input value={strungBy} onChange={(e) => setStrungBy(e.target.value)} className={cellClass} />
        </label>
        <label className="block w-full space-y-1">
          <span className="text-xs font-medium text-slate-500">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cellClass} />
        </label>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void save()}
          disabled={saving}
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

function StringRowInputs({
  label,
  row,
  onChange,
  brands,
  catalog,
}: {
  label: string;
  row: RowSel;
  onChange: (patch: Partial<RowSel>) => void;
  brands: string[];
  catalog: CatalogString[];
}) {
  // Strings of the chosen brand.
  const products = useMemo(
    () => catalog.filter((c) => c.brand === row.brand),
    [catalog, row.brand],
  );
  const product = useMemo(() => catalog.find((c) => c.id === row.productId), [catalog, row.productId]);

  return (
    <tr>
      <td className="pr-2 text-sm font-semibold text-slate-700">{label}</td>
      <td>
        <select
          value={row.brand}
          onChange={(e) => onChange({ brand: e.target.value, productId: '' })}
          className={`${cellClass} min-w-[8rem]`}
        >
          <option value="">—</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          value={row.productId}
          onChange={(e) => onChange({ productId: e.target.value })}
          disabled={!row.brand}
          className={`${cellClass} min-w-[10rem] disabled:opacity-50`}
        >
          <option value="">—</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-[7rem] text-sm text-slate-500">{attributeSummary(product) || '—'}</td>
      <td>
        <input
          value={row.tension}
          onChange={(e) => onChange({ tension: e.target.value })}
          inputMode="decimal"
          placeholder="lb"
          className={`${cellClass} w-20`}
        />
      </td>
    </tr>
  );
}
