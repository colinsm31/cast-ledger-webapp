import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { ProductStock, ProductWithCategory } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { displayStored } from './AttributeInput';
import { StockActions } from './StockActions';

export function ProductDetailPage() {
  const { productId } = useParams<{ productId: string }>();
  const [product, setProduct] = useState<ProductWithCategory | null>(null);
  const [stock, setStock] = useState<ProductStock | null>(null);
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
    setProduct(prod as unknown as ProductWithCategory);

    // On-hand + low-stock for this product from the product_stock view.
    const { data: stockRow } = await supabase
      .from('product_stock')
      .select('*')
      .eq('product_id', productId)
      .maybeSingle();
    setStock((stockRow as ProductStock) ?? null);
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

  if (error && !product) return <p className="text-sm text-red-600">{error}</p>;
  if (!product) return <Spinner label="Loading…" />;

  const onHand = stock ? Number(stock.on_hand) : 0;

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

      {/* Stock */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Stock</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm">
              <span className="font-semibold">{onHand}</span>{' '}
              <span className="text-slate-400">on hand</span>
            </span>
            {stock?.is_low && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                low
              </span>
            )}
          </div>
        </div>
        <StockActions productId={product.id} onDone={load} onError={setError} />
      </section>

      {/* Details */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="divide-y divide-slate-100">
          {product.sell_price != null && <Row label="Sell price" value={`$${product.sell_price.toFixed(2)}`} />}
          {product.cost != null && <Row label="Cost" value={`$${product.cost.toFixed(2)}`} />}
          {product.reorder_point != null && <Row label="Reorder point" value={String(product.reorder_point)} />}
          {product.barcode && <Row label="UPC" value={product.barcode} />}
          {product.sku && <Row label="SKU" value={product.sku} />}
          {Object.entries(product.attributes ?? {}).map(([key, value]) => (
            <Row key={key} label={key} value={displayStored(value)} />
          ))}
        </dl>
      </section>
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
