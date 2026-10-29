import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { AttributeDef, Category, JsonValue, Product } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { PickOrAdd } from '../lookups/PickOrAdd';
import { useSettings } from '../../lib/settings';
import { LoadError } from '../../components/LoadError';
import { useBack } from '../../app/BackContext';
import { AttributeInput, toStoredValue } from './AttributeInput';
import { ScanFlowParams, safeReturnTo, withParams } from '../scan/scanFlow';
import { subCentError } from '../../lib/money';
import { normalizeBarcode } from '../../lib/barcode';
import { firstNumberProblem, parseNumberField } from '../../lib/numberInput';
import { productSaveError } from './productSaveError';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

export function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const isEdit = Boolean(productId);
  const navigate = useNavigate();
  const { settings, error: settingsError, reload: reloadSettings } = useSettings();
  const [searchParams] = useSearchParams();
  const prefillUpc = searchParams.get('upc') ?? '';
  // When opened mid-flow (e.g. from a scan on the POS), Back / Cancel / save all
  // return to the caller instead of the product list or detail page.
  const returnTo = safeReturnTo(searchParams.get(ScanFlowParams.returnTo));
  const cancelTarget = returnTo ?? (isEdit && productId ? `/products/${productId}` : '/products');
  useBack(cancelTarget);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [attributeDefs, setAttributeDefs] = useState<AttributeDef[]>([]);
  // The category the attribute defs were loaded for ('' for none chosen; null while loading).
  const [attrDefsFor, setAttrDefsFor] = useState<string | null>(null);
  const [attrDefsError, setAttrDefsError] = useState<string | null>(null);
  const [attrDefsLoadCount, setAttrDefsLoadCount] = useState(0);

  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [cost, setCost] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [upc, setUpc] = useState(prefillUpc);
  const [sku, setSku] = useState('');
  const [attrValues, setAttrValues] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Category name scopes the pick-or-add lists so, e.g., racket names and string
  // names stay in separate dropdowns.
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  );
  const categoryName = selectedCategory?.name ?? '';
  // Unit tracking comes from the category (the server sets it): rackets, and any
  // other category flagged serialized_default, are tracked unit by unit.
  const tracksUnits = selectedCategory?.serialized_default ?? false;

  // Load categories once.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('categories').select('*').order('sort_order').order('name');
      setCategories((data ?? []) as Category[]);
    })();
  }, []);

  // Load attribute defs whenever the chosen category changes. Saving waits
  // until they've loaded for that category: saving before would store no
  // attributes and erase the product's existing ones (code review #41).
  useEffect(() => {
    let active = true;
    setAttrDefsFor(null);
    setAttrDefsError(null);
    if (!categoryId) {
      setAttributeDefs([]);
      setAttrDefsFor('');
      return;
    }
    void (async () => {
      const { data, error: err } = await supabase
        .from('attribute_defs')
        .select('*')
        .eq('category_id', categoryId)
        .order('sort_order')
        .order('name');
      if (!active) return;
      if (err) {
        setAttrDefsError(`Couldn't load this category's attributes: ${errorMessage(err)}`);
        return;
      }
      setAttributeDefs((data ?? []) as AttributeDef[]);
      setAttrDefsFor(categoryId);
    })();
    return () => {
      active = false;
    };
  }, [categoryId, attrDefsLoadCount]);
  const attrDefsReady = attrDefsFor === categoryId;

  // Prefill the reorder point with the shop default for new products.
  useEffect(() => {
    if (!isEdit && settings?.default_reorder_point != null) {
      setReorderPoint((cur) => (cur === '' ? String(settings.default_reorder_point) : cur));
    }
  }, [isEdit, settings]);

  // In edit mode, load the existing product and prefill.
  useEffect(() => {
    if (!isEdit || !productId) return;
    void (async () => {
      const { data, error: err } = await supabase.from('products').select('*').eq('id', productId).single();
      if (err) {
        setError(errorMessage(err));
        setLoading(false);
        return;
      }
      const p = data as Product;
      setCategoryId(p.category_id);
      setBrand(p.brand ?? '');
      setName(p.name);
      setSellPrice(p.sell_price != null ? String(p.sell_price) : '');
      setCost(p.cost != null ? String(p.cost) : '');
      setReorderPoint(p.reorder_point != null ? String(p.reorder_point) : '');
      setUpc(p.barcode ?? '');
      setSku(p.sku ?? '');
      const prefilled: Record<string, string> = {};
      for (const [key, value] of Object.entries(p.attributes ?? {})) {
        prefilled[key] = value == null ? '' : String(value);
      }
      setAttrValues(prefilled);
      setLoading(false);
    })();
  }, [isEdit, productId]);

  function validate(): string | null {
    if (!categoryId) return 'Choose a category';
    if (!name.trim()) return 'Name is required';
    if (!attrDefsReady) return "The category's attributes are still loading.";
    const numberProblem = firstNumberProblem(
      parseNumberField(sellPrice, 'Sell price'),
      parseNumberField(cost, 'Cost'),
      parseNumberField(reorderPoint, 'Reorder point', 'whole'),
    );
    if (numberProblem) return numberProblem;
    const subCent = subCentError({ 'Sell price': sellPrice, Cost: cost });
    if (subCent) return subCent;
    for (const def of attributeDefs) {
      if (def.required && !attrValues[def.name]?.trim()) return `${def.name} is required`;
    }
    return null;
  }

  async function handleSave() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);

    const attributes: Record<string, JsonValue> = {};
    for (const def of attributeDefs) {
      const stored = toStoredValue(def, attrValues[def.name] ?? '');
      if (stored !== undefined) attributes[def.name] = stored;
    }

    const payload = {
      category_id: categoryId,
      brand: brand.trim() || null,
      name: name.trim(),
      attributes,
      sell_price: sellPrice ? Number(sellPrice) : null,
      cost: cost ? Number(cost) : null,
      reorder_point: reorderPoint ? Number(reorderPoint) : null,
      barcode: normalizeBarcode(upc) || null,
      sku: sku.trim() || null,
    };

    if (isEdit && productId) {
      const { error: err } = await supabase.from('products').update(payload).eq('id', productId);
      setSaving(false);
      if (err) setError(productSaveError(err));
      else navigate(`/products/${productId}`);
      return;
    }

    // Each product is a unique, stock-tracked item (its own UPC/price/attributes).
    const { data, error: err } = await supabase.from('products').insert(payload).select('id').single();
    setSaving(false);
    if (err) {
      setError(productSaveError(err));
      return;
    }
    navigate(
      returnTo
        ? withParams(returnTo, { [ScanFlowParams.addProduct]: data.id })
        : withParams(`/products/${data.id}`, { [ScanFlowParams.created]: '1' }),
    );
  }

  if (loading) return <Spinner label="Loading…" />;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">{isEdit ? 'Edit product' : 'New product'}</h1>
      {/* Only a new product takes the default reorder point. */}
      {!isEdit && !settings && settingsError && <LoadError message={settingsError} onRetry={reloadSettings} />}

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Category *</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={isEdit}
            className={inputClass}
          >
            <option value="">Choose</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <span className="text-xs font-medium text-slate-500">Brand</span>
            <PickOrAdd kind="brand" value={brand} onChange={setBrand} />
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs font-medium text-slate-500">Name *</span>
          {categoryId ? (
            <PickOrAdd kind={`name:${categoryName}`} value={name} onChange={setName} placeholder="Choose or add a name" />
          ) : (
            <p className="text-sm text-slate-400">Choose a category first.</p>
          )}
        </div>

        <div className="flex gap-2">
          <label className="block flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-500">Sell price</span>
            <input value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className={inputClass} inputMode="decimal" />
          </label>
          <label className="block flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-500">Cost</span>
            <input value={cost} onChange={(e) => setCost(e.target.value)} className={inputClass} inputMode="decimal" />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Reorder point</span>
          <input value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} className={inputClass} inputMode="numeric" />
        </label>

        <div className="flex gap-2">
          <label className="block flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-500">UPC</span>
            <input
              value={upc}
              onChange={(e) => setUpc(e.target.value)}
              placeholder="Scan or type the barcode"
              className={inputClass}
            />
          </label>
          <label className="block flex-1 space-y-1">
            <span className="text-xs font-medium text-slate-500">SKU</span>
            <input value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
          </label>
        </div>

        {tracksUnits && (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
            Tracked as individual units ({categoryName} category)
            <span className="block text-xs text-slate-500">
              Stock is the count of scanned-in units, each with its own barcode. The UPC above is the shared model code.
            </span>
          </p>
        )}
      </section>

      {attributeDefs.length > 0 && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Attributes</h2>
          {attributeDefs.map((def) => (
            <AttributeInput
              key={def.id}
              def={def}
              value={attrValues[def.name] ?? ''}
              onChange={(v) => setAttrValues((prev) => ({ ...prev, [def.name]: v }))}
              lookupKind={`${categoryName}:${def.name}`}
            />
          ))}
        </section>
      )}

      {attrDefsError && (
        <LoadError message={attrDefsError} onRetry={() => setAttrDefsLoadCount((count) => count + 1)} />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving || !attrDefsReady}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </button>
        <button onClick={() => navigate(cancelTarget)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
