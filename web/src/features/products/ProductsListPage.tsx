import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { ProductStock, ProductWithCategory } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

export function ProductsListPage() {
  const [products, setProducts] = useState<ProductWithCategory[] | null>(null);
  const [stockByProduct, setStockByProduct] = useState<Record<string, ProductStock>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('products')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });
      if (err) {
        setError(errorMessage(err));
        return;
      }
      const loaded = (data ?? []) as unknown as ProductWithCategory[];
      setProducts(loaded);

      if (loaded.length > 0) {
        const { data: stock } = await supabase
          .from('product_stock')
          .select('*')
          .in('product_id', loaded.map((p) => p.id));
        const map: Record<string, ProductStock> = {};
        for (const row of (stock ?? []) as ProductStock[]) map[row.product_id] = row;
        setStockByProduct(map);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Products</h1>
        <Link
          to="/products/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New product
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {products === null && !error && <Spinner label="Loading…" />}
      {products && products.length === 0 && (
        <EmptyState title="No products yet" message="Add your first product to start tracking stock." />
      )}
      {products && products.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {products.map((product) => (
            <li key={product.id}>
              <Link to={`/products/${product.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50">
                <div>
                  <p className="font-medium text-slate-900">
                    {product.brand ? `${product.brand} ` : ''}
                    {product.name}
                  </p>
                  <p className="text-sm text-slate-500">{product.categories?.name ?? '—'}</p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  {stockByProduct[product.id]?.has_low_stock && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                      low
                    </span>
                  )}
                  <div>
                    <p className="text-sm text-slate-600">
                      {stockByProduct[product.id]?.on_hand ?? 0}{' '}
                      <span className="text-slate-400">in stock</span>
                    </p>
                    {product.sell_price != null && (
                      <p className="font-medium text-slate-900">${product.sell_price.toFixed(2)}</p>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
