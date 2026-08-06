import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Category, ProductStock, ProductWithCategory } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

export function ProductsListPage() {
  const [products, setProducts] = useState<ProductWithCategory[] | null>(null);
  const [stockByProduct, setStockByProduct] = useState<Record<string, ProductStock>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    void (async () => {
      const [productsRes, categoriesRes] = await Promise.all([
        supabase.from('products').select('*, categories(name)').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('sort_order').order('name'),
      ]);
      if (productsRes.error) {
        setError(errorMessage(productsRes.error));
        return;
      }
      const loaded = (productsRes.data ?? []) as unknown as ProductWithCategory[];
      setProducts(loaded);
      setCategories((categoriesRes.data ?? []) as Category[]);

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

  // Filter the loaded products by search term (name/brand) and category.
  const filtered = useMemo(() => {
    if (!products) return [];
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (categoryId && p.category_id !== categoryId) return false;
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        (p.brand?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [products, search, categoryId, showInactive]);

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

      {/* Search + category filter */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or brand…"
          className="flex-1 min-w-[12rem] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {products === null && !error && <Spinner label="Loading…" />}
      {products && products.length === 0 && (
        <EmptyState title="No products yet" message="Add your first product to start tracking stock." />
      )}
      {products && products.length > 0 && filtered.length === 0 && (
        <EmptyState title="No matches" message="No products match your search or filter." />
      )}
      {filtered.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {filtered.map((product) => (
            <li key={product.id}>
              <Link to={`/products/${product.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50">
                <div>
                  <p className="font-medium text-slate-900">
                    {product.brand ? `${product.brand} ` : ''}
                    {product.name}
                    {!product.is_active && (
                      <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        inactive
                      </span>
                    )}
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
