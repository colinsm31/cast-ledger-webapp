import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type {
  AttributeDef,
  ProductWithCategory,
  Variant,
  VariantStockDetail,
} from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { StockActions } from './StockActions';
import { variantLabel } from './variantLabel';
import { displayStored } from './AttributeInput';

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

  if (error && !variant) return <p className="text-sm text-red-600">{error}</p>;
  if (!variant) return <Spinner label="Loading…" />;

  const product = variant.products;
  const effectivePrice = variant.sell_price ?? product?.sell_price ?? null;
  const label = variantLabel(variant, variantDefs);

  return (
    <div className="max-w-2xl space-y-6">
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
        </div>
        {product?.categories?.name && (
          <p className="text-sm text-slate-500">{product.categories.name}</p>
        )}
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

      {/* Details */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Item</h2>
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
    </div>
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
