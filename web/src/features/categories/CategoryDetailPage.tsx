import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { AttributeDef, AttributeValueType, Category } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';

const VALUE_TYPES: { value: AttributeValueType; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' },
  { value: 'enum', label: 'Enum' },
  { value: 'bool', label: 'Yes / No' },
];

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

function enumList(def: AttributeDef): string[] {
  return Array.isArray(def.enum_values)
    ? def.enum_values.filter((v): v is string => typeof v === 'string')
    : [];
}

export function CategoryDetailPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const [category, setCategory] = useState<Category | null>(null);
  const [attributes, setAttributes] = useState<AttributeDef[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!categoryId) return;
    const [catRes, attrRes] = await Promise.all([
      supabase.from('categories').select('*').eq('id', categoryId).single(),
      supabase
        .from('attribute_defs')
        .select('*')
        .eq('category_id', categoryId)
        .order('sort_order')
        .order('name'),
    ]);
    if (catRes.error) setError(errorMessage(catRes.error));
    else {
      setCategory(catRes.data as Category);
      setAttributes((attrRes.data ?? []) as AttributeDef[]);
    }
  }, [categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function deleteAttribute(id: string) {
    setError(null);
    const { error: err } = await supabase.from('attribute_defs').delete().eq('id', id);
    if (err) setError(errorMessage(err));
    else await load();
  }

  if (error && !category) return <p className="text-sm text-red-600">{error}</p>;
  if (!category) return <Spinner label="Loading…" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{category.name}</h1>
        <p className="text-sm text-slate-500">Attributes for this category.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-2">
        {attributes.length === 0 ? (
          <p className="text-sm text-slate-500">No attributes yet. Add one below.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {attributes.map((attribute) => (
              <li key={attribute.id} className="flex items-start justify-between gap-3 p-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{attribute.name}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {attribute.value_type}
                    </span>
                    {attribute.unit && (
                      <span className="text-xs text-slate-400">({attribute.unit})</span>
                    )}
                    {attribute.is_variant_dimension && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        variant
                      </span>
                    )}
                    {attribute.required && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                        required
                      </span>
                    )}
                  </div>
                  {attribute.value_type === 'enum' && enumList(attribute).length > 0 && (
                    <p className="text-xs text-slate-500">
                      Values: {enumList(attribute).join(', ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => void deleteAttribute(attribute.id)}
                  className="shrink-0 text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddAttributeForm
        categoryId={category.id}
        nextSortOrder={attributes.length}
        onAdded={load}
        onError={setError}
      />
    </div>
  );
}

// MARK: - Add attribute form

function AddAttributeForm({
  categoryId,
  nextSortOrder,
  onAdded,
  onError,
}: {
  categoryId: string;
  nextSortOrder: number;
  onAdded: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [valueType, setValueType] = useState<AttributeValueType>('text');
  const [unit, setUnit] = useState('');
  const [required, setRequired] = useState(false);
  const [isVariant, setIsVariant] = useState(false);
  const [enumRaw, setEnumRaw] = useState('');
  const [saving, setSaving] = useState(false);

  function parseEnum(): string[] {
    return enumRaw
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  async function add() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      onError('Attribute name is required');
      return;
    }
    if (valueType === 'enum' && parseEnum().length === 0) {
      onError('An enum attribute needs at least one value');
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.from('attribute_defs').insert({
      category_id: categoryId,
      name: trimmedName,
      value_type: valueType,
      unit: unit.trim() || null,
      required,
      is_variant_dimension: isVariant,
      enum_values: valueType === 'enum' ? parseEnum() : null,
      sort_order: nextSortOrder,
    });
    setSaving(false);
    if (err) {
      onError(
        errorMessage(err).includes('duplicate')
          ? 'An attribute with that name already exists in this category.'
          : errorMessage(err),
      );
      return;
    }
    setName('');
    setUnit('');
    setEnumRaw('');
    setRequired(false);
    setIsVariant(false);
    setValueType('text');
    await onAdded();
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Add attribute</h2>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="grip_size" />
      </label>

      <div className="flex gap-2">
        <label className="block flex-1 space-y-1">
          <span className="text-xs font-medium text-slate-500">Type</span>
          <select value={valueType} onChange={(e) => setValueType(e.target.value as AttributeValueType)} className={inputClass}>
            {VALUE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 space-y-1">
          <span className="text-xs font-medium text-slate-500">Unit (optional)</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} placeholder="in, g, …" />
        </label>
      </div>

      {valueType === 'enum' && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Values (comma-separated)</span>
          <input value={enumRaw} onChange={(e) => setEnumRaw(e.target.value)} className={inputClass} placeholder="4 1/4, 4 3/8, 4 1/2" />
        </label>
      )}

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isVariant} onChange={(e) => setIsVariant(e.target.checked)} />
          Variant dimension
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required
        </label>
      </div>
      <p className="text-xs text-slate-400">
        “Variant dimension” means this attribute’s values split a product into separately-stocked
        variants (e.g. size, color, grip size).
      </p>

      <button
        onClick={() => void add()}
        disabled={saving}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Adding…' : 'Add attribute'}
      </button>
    </section>
  );
}
