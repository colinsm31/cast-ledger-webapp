import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Category, ProductStock, ProductWithCategory } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { displayStored } from './AttributeInput';

const NO_BRAND = '(No brand)';

// Full row label: brand + name + every entered attribute value, in the
// category's attribute order (e.g. "Wilson Pro Staff 97 4 3/8"). `order` is the
// category's attribute names sorted by sort_order; any extra attributes not in
// the definitions are appended after.
function productLabel(p: ProductWithCategory, order: string[]): string {
  const attributes = p.attributes ?? {};
  const seen = new Set<string>();
  const values: string[] = [];
  for (const name of order) {
    const v = attributes[name];
    if (v != null && v !== '') {
      values.push(displayStored(v));
      seen.add(name);
    }
  }
  for (const [name, v] of Object.entries(attributes)) {
    if (!seen.has(name) && v != null && v !== '') values.push(displayStored(v));
  }
  return [p.brand, p.name, ...values].filter(Boolean).join(' ');
}

export function ProductsListPage() {
  const [products, setProducts] = useState<ProductWithCategory[] | null>(null);
  const [stockByProduct, setStockByProduct] = useState<Record<string, ProductStock>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  // Attribute names per category, ordered by sort_order — drives the row label.
  const [attrOrderByCategory, setAttrOrderByCategory] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);

  // Category + brand selections live in the URL, so browser back walks up the
  // drill-down (products → brands → categories) and views are linkable.
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryId = searchParams.get('category') ?? '';
  const brandSelected = searchParams.has('brand');
  const brand = searchParams.get('brand') ?? '';
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    void (async () => {
      const [productsRes, categoriesRes, attrsRes] = await Promise.all([
        supabase.from('products').select('*, categories(name)').order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('sort_order').order('name'),
        supabase.from('attribute_defs').select('category_id, name, sort_order').order('sort_order'),
      ]);
      if (productsRes.error) {
        setError(errorMessage(productsRes.error));
        return;
      }
      const loaded = (productsRes.data ?? []) as unknown as ProductWithCategory[];
      setProducts(loaded);
      setCategories((categoriesRes.data ?? []) as Category[]);

      const order: Record<string, string[]> = {};
      for (const row of (attrsRes.data ?? []) as { category_id: string; name: string }[]) {
        (order[row.category_id] ??= []).push(row.name);
      }
      setAttrOrderByCategory(order);

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

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId],
  );

  // Distinct brands within the chosen category, alphabetical. Empty string maps
  // to the "(No brand)" bucket.
  const brandsInCategory = useMemo(() => {
    if (!products || !categoryId) return [];
    const set = new Set<string>();
    for (const p of products) {
      if (p.category_id === categoryId) set.add(p.brand ?? '');
    }
    return Array.from(set).sort((a, b) => (a || NO_BRAND).localeCompare(b || NO_BRAND));
  }, [products, categoryId]);

  // Products in the chosen category + brand, filtered by search, alphabetical.
  const filtered = useMemo(() => {
    if (!products || !categoryId || !brandSelected) return [];
    const term = search.trim().toLowerCase();
    const order = attrOrderByCategory[categoryId] ?? [];
    return products
      .filter((p) => {
        if (p.category_id !== categoryId) return false;
        if ((p.brand ?? '') !== brand) return false;
        if (!showInactive && !p.is_active) return false;
        if (!term) return true;
        return (
          p.name.toLowerCase().includes(term) ||
          (p.brand?.toLowerCase().includes(term) ?? false)
        );
      })
      .sort((a, b) => productLabel(a, order).localeCompare(productLabel(b, order)));
  }, [products, categoryId, brand, brandSelected, search, showInactive, attrOrderByCategory]);

  function openCategory(id: string) {
    setSearch('');
    setSearchParams({ category: id });
  }
  function openBrand(b: string) {
    setSearch('');
    setSearchParams({ category: categoryId, brand: b });
  }
  function backToCategories() {
    setSearch('');
    setSearchParams({});
  }
  function backToBrands() {
    setSearch('');
    setSearchParams({ category: categoryId });
  }

  const newProductButton = (
    <Link
      to="/products/new"
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
    >
      New product
    </Link>
  );

  // ---- Level 1: category picker ----
  if (!categoryId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Products</h1>
          {newProductButton}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {products === null && !error && <Spinner label="Loading…" />}

        {categories.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {categories.map((category) => (
              <li key={category.id}>
                <button
                  onClick={() => openCategory(category.id)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{category.name}</span>
                  <span className="text-slate-400" aria-hidden>›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ---- Level 2: brand picker (within a category) ----
  if (!brandSelected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={backToCategories} className="text-sm text-blue-600 hover:underline">
              ‹ All categories
            </button>
            <h1 className="text-xl font-bold text-slate-900">{selectedCategory?.name ?? 'Products'}</h1>
          </div>
          {newProductButton}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {products === null && !error && <Spinner label="Loading…" />}
        {products && brandsInCategory.length === 0 && (
          <EmptyState title="No products yet" message="No products in this category yet." />
        )}
        {brandsInCategory.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {brandsInCategory.map((b) => (
              <li key={b || NO_BRAND}>
                <button
                  onClick={() => openBrand(b)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{b || NO_BRAND}</span>
                  <span className="text-slate-400" aria-hidden>›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // ---- Level 3: products within a category + brand ----
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={backToBrands} className="text-sm text-blue-600 hover:underline">
            ‹ {selectedCategory?.name ?? 'Brands'}
          </button>
          <h1 className="text-xl font-bold text-slate-900">{brand || NO_BRAND}</h1>
        </div>
        {newProductButton}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name…"
          className="flex-1 min-w-[12rem] rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
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
      {products && filtered.length === 0 && (
        <EmptyState title="No products here" message="No products match your search." />
      )}
      {filtered.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {filtered.map((product) => (
            <li key={product.id}>
              <Link to={`/products/${product.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50">
                <div>
                  <p className="font-medium text-slate-900">
                    {productLabel(product, attrOrderByCategory[product.category_id] ?? [])}
                    {!product.is_active && (
                      <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">
                        inactive
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500">{product.categories?.name ?? '—'}</p>
                </div>
                <div className="flex items-center gap-3 text-right">
                  {stockByProduct[product.id]?.is_low && (
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
