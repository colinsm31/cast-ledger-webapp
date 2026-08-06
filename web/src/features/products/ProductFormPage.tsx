import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { AttributeDef, Category, JsonValue, Product } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { PickOrAdd } from '../lookups/PickOrAdd';
import { AttributeInput, toStoredValue } from './AttributeInput';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

export function ProductFormPage() {
  const { productId } = useParams<{ productId: string }>();
  const isEdit = Boolean(productId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillUpc = searchParams.get('upc') ?? '';

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [attributeDefs, setAttributeDefs] = useState<AttributeDef[]>([]);

  const [brand, setBrand] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [cost, setCost] = useState('');
  const [reorderPoint, setReorderPoint] = useState('');
  const [attrValues, setAttrValues] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Descriptive (non-variant) attribute defs drive the product-level fields.
  const descriptiveDefs = useMemo(
    () => attributeDefs.filter((d) => !d.is_variant_dimension),
    [attributeDefs],
  );
  const variantDefs = useMemo(
    () => attributeDefs.filter((d) => d.is_variant_dimension),
    [attributeDefs],
  );

  // Load categories once.
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('categories').select('*').order('sort_order').order('name');
      setCategories((data ?? []) as Category[]);
    })();
  }, []);

  // Load attribute defs whenever the chosen category changes.
  const loadAttrDefs = useCallback(async (catId: string) => {
    if (!catId) {
      setAttributeDefs([]);
      return;
    }
    const { data } = await supabase
      .from('attribute_defs')
      .select('*')
      .eq('category_id', catId)
      .order('sort_order')
      .order('name');
    setAttributeDefs((data ?? []) as AttributeDef[]);
  }, []);

  useEffect(() => {
    void loadAttrDefs(categoryId);
  }, [categoryId, loadAttrDefs]);

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
      setDescription(p.description ?? '');
      setSellPrice(p.sell_price != null ? String(p.sell_price) : '');
      setCost(p.cost != null ? String(p.cost) : '');
      setReorderPoint(p.reorder_point != null ? String(p.reorder_point) : '');
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
    if (sellPrice && Number.isNaN(Number(sellPrice))) return 'Sell price must be a number';
    if (cost && Number.isNaN(Number(cost))) return 'Cost must be a number';
    for (const def of descriptiveDefs) {
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
    for (const def of descriptiveDefs) {
      const stored = toStoredValue(def, attrValues[def.name] ?? '');
      if (stored !== undefined) attributes[def.name] = stored;
    }

    const payload = {
      category_id: categoryId,
      brand: brand.trim() || null,
      name: name.trim(),
      description: description.trim() || null,
      attributes,
      sell_price: sellPrice ? Number(sellPrice) : null,
      cost: cost ? Number(cost) : null,
      reorder_point: reorderPoint ? Number(reorderPoint) : null,
    };

    if (isEdit && productId) {
      const { error: err } = await supabase.from('products').update(payload).eq('id', productId);
      setSaving(false);
      if (err) setError(errorMessage(err));
      else navigate(`/products/${productId}`);
      return;
    }

    // The product is just the model/header. Its stockable item(s) — each with a
    // required UPC — are added as variants on the product page next.
    const { data, error: err } = await supabase.from('products').insert(payload).select('id').single();
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    // Carry a scanned UPC through so the add-item form pre-fills it.
    navigate(prefillUpc ? `/products/${data.id}?upc=${encodeURIComponent(prefillUpc)}` : `/products/${data.id}`);
  }

  if (loading) return <Spinner label="Loading…" />;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">{isEdit ? 'Edit product' : 'New product'}</h1>

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

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Name *</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Pro Staff 97 v14" />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Description</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </label>

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
      </section>

      {descriptiveDefs.length > 0 && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-700">Attributes</h2>
          {descriptiveDefs.map((def) => (
            <AttributeInput
              key={def.id}
              def={def}
              value={attrValues[def.name] ?? ''}
              onChange={(v) => setAttrValues((prev) => ({ ...prev, [def.name]: v }))}
            />
          ))}
        </section>
      )}

      {!isEdit && prefillUpc && (
        <p className="text-sm text-blue-700">
          UPC <span className="font-mono font-medium">{prefillUpc}</span> will be pre-filled on the
          first item after you save.
        </p>
      )}

      {!isEdit && (
        <p className="text-sm text-slate-500">
          {variantDefs.length > 0
            ? `After saving, add this product's items (${variantDefs
                .map((d) => d.name)
                .join(', ')}) — each with its UPC — on the product page.`
            : 'After saving, add this product’s item and its UPC on the product page.'}
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create product'}
        </button>
        <button onClick={() => navigate('/products')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
