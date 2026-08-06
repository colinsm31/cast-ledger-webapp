import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type {
  AttributeDef,
  JsonValue,
  ProductWithCategory,
  Variant,
  VariantStockDetail,
} from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { AttributeInput, toStoredValue, displayStored } from './AttributeInput';
import { StockActions } from './StockActions';
import { variantLabel } from './variantLabel';

interface StockInfo {
  on_hand: number;
  is_low: boolean;
}

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [searchParams] = useSearchParams();
  const prefillUpc = searchParams.get('upc') ?? '';
  const [product, setProduct] = useState<ProductWithCategory | null>(null);
  const [variantDefs, setVariantDefs] = useState<AttributeDef[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [stockByVariant, setStockByVariant] = useState<Record<string, StockInfo>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    const { data: prod, error: prodErr } = await supabase
      .from('products')
      .select('*, categories(name)')
      .eq('id', productId)
      .single();
    if (prodErr) {
      setError(errorMessage(prodErr));
      return;
    }
    const loadedProduct = prod as unknown as ProductWithCategory;
    setProduct(loadedProduct);

    const [defsRes, variantsRes] = await Promise.all([
      supabase
        .from('attribute_defs')
        .select('*')
        .eq('category_id', loadedProduct.category_id)
        .eq('is_variant_dimension', true)
        .order('sort_order'),
      supabase.from('variants').select('*').eq('product_id', productId).order('created_at'),
    ]);
    setVariantDefs((defsRes.data ?? []) as AttributeDef[]);
    const loadedVariants = (variantsRes.data ?? []) as Variant[];
    setVariants(loadedVariants);

    // On-hand + low-stock per variant from the variant_stock_detail view.
    if (loadedVariants.length > 0) {
      const ids = loadedVariants.map((v) => v.id);
      const { data: stock } = await supabase
        .from('variant_stock_detail')
        .select('*')
        .in('variant_id', ids);
      const map: Record<string, StockInfo> = {};
      for (const row of (stock ?? []) as VariantStockDetail[]) {
        map[row.variant_id] = { on_hand: Number(row.on_hand), is_low: row.is_low };
      }
      setStockByVariant(map);
    } else {
      setStockByVariant({});
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive() {
    if (!product) return;
    setError(null);
    const { error: err } = await supabase
      .from('products')
      .update({ is_active: !product.is_active })
      .eq('id', product.id);
    if (err) setError(errorMessage(err));
    else await load();
  }

  async function deleteVariant(id: string) {
    setError(null);
    const { error: err } = await supabase.from('variants').delete().eq('id', id);
    if (err) {
      const message = errorMessage(err);
      // A variant with stock/sales history can't be hard-deleted (FK from the
      // ledger / sale lines). Surface that clearly instead of a raw error.
      setError(
        message.toLowerCase().includes('foreign key') || message.includes('23503')
          ? "Can't delete an item that has stock or sales history."
          : message,
      );
      return;
    }
    await load();
  }

  if (error && !product) return <p className="text-sm text-red-600">{error}</p>;
  if (!product) return <Spinner label="Loading…" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">
              {product.brand ? `${product.brand} ` : ''}
              {product.name}
            </h1>
            {!product.is_active && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                inactive
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">{product.categories?.name ?? '—'}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => void toggleActive()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {product.is_active ? 'Archive' : 'Reactivate'}
          </button>
          <Link
            to={`/products/${product.id}/edit`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="divide-y divide-slate-100">
          {product.sell_price != null && <Row label="Sell price" value={`$${product.sell_price.toFixed(2)}`} />}
          {product.cost != null && <Row label="Cost" value={`$${product.cost.toFixed(2)}`} />}
          {product.reorder_point != null && <Row label="Reorder point" value={String(product.reorder_point)} />}
          {product.sku && <Row label="SKU" value={product.sku} />}
          {Object.entries(product.attributes ?? {}).map(([key, value]) => (
            <Row key={key} label={key} value={displayStored(value)} />
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">
          Variants ({variants.length})
        </h2>

        {variants.length === 0 ? (
          <p className="text-sm text-slate-500">No variants yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {variants.map((variant) => {
              const stock = stockByVariant[variant.id];
              return (
                <li key={variant.id} className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <Link
                        to={`/variants/${variant.id}`}
                        className="font-medium text-slate-800 hover:text-blue-700 hover:underline"
                      >
                        {variantLabel(variant, variantDefs)}
                      </Link>
                      {!variant.is_active && (
                        <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          inactive
                        </span>
                      )}
                      {variant.barcode && (
                        <p className="text-xs text-slate-500">UPC {variant.barcode}</p>
                      )}
                      {variant.sku && <p className="text-xs text-slate-400">{variant.sku}</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm">
                        <span className="font-semibold">{stock?.on_hand ?? 0}</span>{' '}
                        <span className="text-slate-400">on hand</span>
                      </span>
                      {stock?.is_low && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                          low
                        </span>
                      )}
                      <button
                        onClick={() => void deleteVariant(variant.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <StockActions variantId={variant.id} onDone={load} onError={setError} />
                </li>
              );
            })}
          </ul>
        )}

        <AddVariantForm
          productId={product.id}
          variantDefs={variantDefs}
          initialUpc={prefillUpc}
          onAdded={load}
          onError={setError}
        />
      </section>
    </div>
  );
}

// MARK: - Add variant form

function AddVariantForm({
  productId,
  variantDefs,
  initialUpc = '',
  onAdded,
  onError,
}: {
  productId: string;
  variantDefs: AttributeDef[];
  initialUpc?: string;
  onAdded: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [upc, setUpc] = useState(initialUpc);
  const [sku, setSku] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [cost, setCost] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [saving, setSaving] = useState(false);

  const hasDimensions = variantDefs.length > 0;

  async function add() {
    // Every variant dimension must have a value (they define the item).
    for (const def of variantDefs) {
      if (!values[def.name]?.trim()) {
        onError(`${def.name} is required`);
        return;
      }
    }
    // UPC is required — it's how the item is scanned/looked up.
    if (!upc.trim()) {
      onError('UPC is required for each item');
      return;
    }
    if (sellPrice && Number.isNaN(Number(sellPrice))) {
      onError('Price must be a number');
      return;
    }
    setSaving(true);
    const variantValues: Record<string, JsonValue> = {};
    for (const def of variantDefs) {
      const stored = toStoredValue(def, values[def.name] ?? '');
      if (stored !== undefined) variantValues[def.name] = stored;
    }
    const { error: err } = await supabase.from('variants').insert({
      product_id: productId,
      variant_values: variantValues,
      barcode: upc.trim(),
      sku: sku.trim() || null,
      sell_price: sellPrice ? Number(sellPrice) : null,
      cost: cost ? Number(cost) : null,
      reorder_point: reorderPoint ? Number(reorderPoint) : null,
    });
    setSaving(false);
    if (err) {
      onError(
        errorMessage(err).includes('duplicate')
          ? 'That UPC is already used by another item.'
          : errorMessage(err),
      );
      return;
    }
    setValues({});
    setUpc('');
    setSku('');
    setSellPrice('');
    setCost('');
    setReorderPoint('');
    await onAdded();
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{hasDimensions ? 'Add item' : 'Add item / UPC'}</p>
      {variantDefs.map((def) => (
        <AttributeInput
          key={def.id}
          def={def}
          value={values[def.name] ?? ''}
          onChange={(v) => setValues((prev) => ({ ...prev, [def.name]: v }))}
        />
      ))}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">UPC *</span>
        <input
          value={upc}
          onChange={(e) => setUpc(e.target.value)}
          placeholder="Scan or type the barcode"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">SKU (optional)</span>
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <label className="block flex-1 min-w-[6rem] space-y-1">
          <span className="text-xs font-medium text-slate-500">Price (optional)</span>
          <input
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            inputMode="decimal"
            placeholder="Overrides product"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="block flex-1 min-w-[6rem] space-y-1">
          <span className="text-xs font-medium text-slate-500">Cost (optional)</span>
          <input
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <label className="block flex-1 min-w-[6rem] space-y-1">
          <span className="text-xs font-medium text-slate-500">Reorder pt (optional)</span>
          <input
            value={reorderPoint}
            onChange={(e) => setReorderPoint(e.target.value)}
            inputMode="numeric"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </div>
      <button
        onClick={() => void add()}
        disabled={saving}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add item'}
      </button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right text-slate-900">{value}</dd>
    </div>
  );
}
