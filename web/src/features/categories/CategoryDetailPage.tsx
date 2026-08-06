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
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

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
    if (err) {
      const message = errorMessage(err);
      setError(
        message.toLowerCase().includes('foreign key') || message.includes('23503')
          ? "Can't delete an attribute that's in use by products."
          : message,
      );
      return;
    }
    await load();
  }

  function startRename() {
    setNameDraft(category?.name ?? '');
    setRenaming(true);
  }

  async function saveRename() {
    const name = nameDraft.trim();
    if (!name || !category) return;
    setError(null);
    const { error: err } = await supabase.from('categories').update({ name }).eq('id', category.id);
    if (err) {
      setError(
        errorMessage(err).includes('duplicate')
          ? 'A category with that name already exists.'
          : errorMessage(err),
      );
      return;
    }
    setRenaming(false);
    await load();
  }

  if (error && !category) return <p className="text-sm text-red-600">{error}</p>;
  if (!category) return <Spinner label="Loading…" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        {renaming ? (
          <div className="flex gap-2">
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void saveRename();
                if (e.key === 'Escape') setRenaming(false);
              }}
              className={inputClass}
            />
            <button
              onClick={() => void saveRename()}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Save
            </button>
            <button onClick={() => setRenaming(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{category.name}</h1>
            <button onClick={startRename} className="text-xs text-blue-600 hover:underline">
              Rename
            </button>
          </div>
        )}
        <p className="text-sm text-slate-500">Attributes for this category.</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="space-y-2">
        {attributes.length === 0 ? (
          <p className="text-sm text-slate-500">No attributes yet. Add one below.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {attributes.map((attribute) =>
              editingId === attribute.id ? (
                <li key={attribute.id} className="p-3">
                  <EditAttributeForm
                    attribute={attribute}
                    onCancel={() => setEditingId(null)}
                    onSaved={async () => {
                      setEditingId(null);
                      await load();
                    }}
                    onError={setError}
                  />
                </li>
              ) : (
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
                  <div className="flex shrink-0 gap-3">
                    <button
                      onClick={() => setEditingId(attribute.id)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void deleteAttribute(attribute.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ),
            )}
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

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Required
      </label>

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

// MARK: - Edit attribute form

function EditAttributeForm({
  attribute,
  onCancel,
  onSaved,
  onError,
}: {
  attribute: AttributeDef;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(attribute.name);
  const [valueType, setValueType] = useState<AttributeValueType>(attribute.value_type);
  const [unit, setUnit] = useState(attribute.unit ?? '');
  const [required, setRequired] = useState(attribute.required);
  const [enumRaw, setEnumRaw] = useState(enumList(attribute).join(', '));
  const [saving, setSaving] = useState(false);

  function parseEnum(): string[] {
    return enumRaw.split(',').map((v) => v.trim()).filter(Boolean);
  }

  async function save() {
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
    const { error: err } = await supabase
      .from('attribute_defs')
      .update({
        name: trimmedName,
        value_type: valueType,
        unit: unit.trim() || null,
        required,
        enum_values: valueType === 'enum' ? parseEnum() : null,
      })
      .eq('id', attribute.id);
    setSaving(false);
    if (err) {
      onError(
        errorMessage(err).includes('duplicate')
          ? 'An attribute with that name already exists in this category.'
          : errorMessage(err),
      );
      return;
    }
    await onSaved();
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
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
          <input value={unit} onChange={(e) => setUnit(e.target.value)} className={inputClass} />
        </label>
      </div>
      {valueType === 'enum' && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Values (comma-separated)</span>
          <input value={enumRaw} onChange={(e) => setEnumRaw(e.target.value)} className={inputClass} />
        </label>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        Required
      </label>
      <div className="flex gap-2">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
