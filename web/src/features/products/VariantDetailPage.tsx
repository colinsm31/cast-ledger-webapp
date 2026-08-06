import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type {
  AttributeDef,
  ProductWithCategory,
  Variant,
  VariantStockDetail,
} from '../../types/domain';
import type { JsonValue } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { StockActions } from './StockActions';
import { variantLabel } from './variantLabel';
import { AttributeInput, toStoredValue, displayStored } from './AttributeInput';

// A variant joined with its product + category (PostgREST nested embed).
interface VariantWithProduct extends Variant {
  products: ProductWithCategory | null;
}

export function VariantDetailPage() {
  const { variantId } = useParams<{ variantId: string }>();
  const [variant, setVariant] = useState<VariantWithProduct | null>(null);
  const [variantDefs, setVariantDefs] = useState<AttributeDef[]>([]);
  const [stock, setStock] = useState<VariantStockDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!variantId) return;
    const { data, error: err } = await supabase
      .from('variants')
      .select('*, products(*, categories(name))')
      .eq('id', variantId)
      .single();
    if (err) {
      setError(errorMessage(err));
      return;
    }
    const loaded = data as unknown as VariantWithProduct;
    setVariant(loaded);

    const [defsRes, stockRes] = await Promise.all([
      loaded.products
        ? supabase
            .from('attribute_defs')
            .select('*')
            .eq('category_id', loaded.products.category_id)
            .eq('is_variant_dimension', true)
            .order('sort_order')
        : Promise.resolve({ data: [] }),
      supabase.from('variant_stock_detail').select('*').eq('variant_id', variantId).maybeSingle(),
    ]);
    setVariantDefs((defsRes.data ?? []) as AttributeDef[]);
    setStock((stockRes.data as VariantStockDetail) ?? null);
  }, [variantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive() {
    if (!variant) return;
    setError(null);
    const { error: err } = await supabase
      .from('variants')
      .update({ is_active: !variant.is_active })
      .eq('id', variant.id);
    if (err) setError(errorMessage(err));
    else await load();
  }

  if (error && !variant) return <p className="text-sm text-red-600">{error}</p>;
  if (!variant) return <Spinner label="Loading…" />;

  const product = variant.products;
  const effectivePrice = variant.sell_price ?? product?.sell_price ?? null;
  const label = variantLabel(variant, variantDefs);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          {product && (
            <Link to={`/products/${product.id}`} className="text-sm text-slate-500 hover:text-blue-700">
              ← {product.brand ? `${product.brand} ` : ''}
              {product.name}
            </Link>
          )}
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900">{label}</h1>
            {stock?.is_low && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                low
              </span>
            )}
            {!variant.is_active && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                inactive
              </span>
            )}
          </div>
          {product?.categories?.name && (
            <p className="text-sm text-slate-500">{product.categories.name}</p>
          )}
        </div>
        <button
          onClick={() => void toggleActive()}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {variant.is_active ? 'Archive' : 'Reactivate'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Stock */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Stock</h2>
          <span className="text-sm">
            <span className="text-2xl font-bold text-slate-900">{stock?.on_hand ?? 0}</span>{' '}
            <span className="text-slate-400">on hand</span>
          </span>
        </div>
        <StockActions variantId={variant.id} onDone={load} onError={setError} />
      </section>

      {/* Details / edit */}
      {editing ? (
        <VariantEditForm
          variant={variant}
          variantDefs={variantDefs}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
          onError={setError}
        />
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Item</h2>
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
          </div>
          <dl className="divide-y divide-slate-100">
            {variant.barcode && <Row label="UPC" value={variant.barcode} mono />}
            {variant.sku && <Row label="SKU" value={variant.sku} />}
            {effectivePrice != null && <Row label="Price" value={`$${effectivePrice.toFixed(2)}`} />}
            {variant.cost != null && <Row label="Cost" value={`$${variant.cost.toFixed(2)}`} />}
            {stock?.reorder_point != null && (
              <Row label="Reorder point" value={String(stock.reorder_point)} />
            )}
            {/* Variant-defining attribute values, in def order. */}
            {variantDefs.map((def) => {
              const value = variant.variant_values?.[def.name];
              if (value == null || value === '') return null;
              return <Row key={def.id} label={def.name} value={displayStored(value)} />;
            })}
          </dl>
        </section>
      )}
    </div>
  );
}

// MARK: - Variant edit form

function VariantEditForm({
  variant,
  variantDefs,
  onCancel,
  onSaved,
  onError,
}: {
  variant: Variant;
  variantDefs: AttributeDef[];
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [dimvalues, setDimvalues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const def of variantDefs) {
      const v = variant.variant_values?.[def.name];
      init[def.name] = v == null ? '' : String(v);
    }
    return init;
  });
  const [upc, setUpc] = useState(variant.barcode ?? '');
  const [sku, setSku] = useState(variant.sku ?? '');
  const [sellPrice, setSellPrice] = useState(variant.sell_price != null ? String(variant.sell_price) : '');
  const [cost, setCost] = useState(variant.cost != null ? String(variant.cost) : '');
  const [reorderPoint, setReorderPoint] = useState(
    variant.reorder_point != null ? String(variant.reorder_point) : '',
  );
  const [saving, setSaving] = useState(false);

  async function save() {
    for (const def of variantDefs) {
      if (!dimvalues[def.name]?.trim()) {
        onError(`${def.name} is required`);
        return;
      }
    }
    if (!upc.trim()) {
      onError('UPC is required');
      return;
    }
    if (sellPrice && Number.isNaN(Number(sellPrice))) {
      onError('Price must be a number');
      return;
    }
    setSaving(true);
    const variantValues: Record<string, JsonValue> = {};
    for (const def of variantDefs) {
      const stored = toStoredValue(def, dimvalues[def.name] ?? '');
      if (stored !== undefined) variantValues[def.name] = stored;
    }
    const { error: err } = await supabase
      .from('variants')
      .update({
        variant_values: variantValues,
        barcode: upc.trim(),
        sku: sku.trim() || null,
        sell_price: sellPrice ? Number(sellPrice) : null,
        cost: cost ? Number(cost) : null,
        reorder_point: reorderPoint ? Number(reorderPoint) : null,
      })
      .eq('id', variant.id);
    setSaving(false);
    if (err) {
      onError(
        errorMessage(err).includes('duplicate')
          ? 'That UPC is already used by another item.'
          : errorMessage(err),
      );
      return;
    }
    await onSaved();
  }

  const fieldClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <h2 className="text-sm font-semibold text-slate-700">Edit item</h2>

      {variantDefs.map((def) => (
        <AttributeInput
          key={def.id}
          def={def}
          value={dimvalues[def.name] ?? ''}
          onChange={(v) => setDimvalues((prev) => ({ ...prev, [def.name]: v }))}
        />
      ))}

      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">UPC *</span>
        <input value={upc} onChange={(e) => setUpc(e.target.value)} className={fieldClass} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">SKU</span>
        <input value={sku} onChange={(e) => setSku(e.target.value)} className={fieldClass} />
      </label>
      <div className="flex flex-wrap gap-2">
        <label className="block flex-1 min-w-[6rem] space-y-1">
          <span className="text-xs font-medium text-slate-500">Price</span>
          <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} inputMode="decimal" className={fieldClass} />
        </label>
        <label className="block flex-1 min-w-[6rem] space-y-1">
          <span className="text-xs font-medium text-slate-500">Cost</span>
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" className={fieldClass} />
        </label>
        <label className="block flex-1 min-w-[6rem] space-y-1">
          <span className="text-xs font-medium text-slate-500">Reorder pt</span>
          <input value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} inputMode="numeric" className={fieldClass} />
        </label>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`text-right text-slate-900 ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}
