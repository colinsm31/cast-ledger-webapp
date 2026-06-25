import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import type { CreateProductDesignParams, SpecValueType } from '../../types/domain';
import { PickOrAdd } from '../lookups/PickOrAdd';

interface DraftAttribute {
  key: number;
  name: string;
  valueType: SpecValueType;
  unit: string;
  required: boolean;
  qcGate: boolean;
  validMin: string;
  validMax: string;
  enumValues: string[];
}

const SELECTABLE_TYPES: { value: SpecValueType; label: string }[] = [
  { value: 'number', label: 'Number' },
  { value: 'text', label: 'Text' },
  { value: 'enum', label: 'Enum' },
  { value: 'bool', label: 'Yes / No' },
  { value: 'list', label: 'List' },
];

let nextKey = 1;
function emptyAttribute(): DraftAttribute {
  return {
    key: nextKey++,
    name: '',
    valueType: 'number',
    unit: '',
    required: false,
    qcGate: false,
    validMin: '',
    validMax: '',
    enumValues: [],
  };
}

export function TemplateDefinerPage() {
  const navigate = useNavigate();
  const [drawingNo, setDrawingNo] = useState('');
  const [family, setFamily] = useState('');
  const [name, setName] = useState('');
  const [revision, setRevision] = useState(1);
  const [attributes, setAttributes] = useState<DraftAttribute[]>([emptyAttribute()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateAttribute(key: number, patch: Partial<DraftAttribute>) {
    setAttributes((current) =>
      current.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    );
  }

  function validate(): string | null {
    if (!drawingNo.trim()) return 'Drawing number is required';
    if (!family.trim()) return 'Family is required';
    if (!name.trim()) return 'Name is required';
    if (attributes.length === 0) return 'Add at least one spec field';
    const names = new Set<string>();
    for (const a of attributes) {
      if (!a.name.trim()) return 'Every spec field needs a name';
      const lower = a.name.trim().toLowerCase();
      if (names.has(lower)) return 'Field names must be unique';
      names.add(lower);
      if (a.valueType === 'number') {
        if (a.validMin && Number.isNaN(Number(a.validMin))) return `${a.name}: min must be a number`;
        if (a.validMax && Number.isNaN(Number(a.validMax))) return `${a.name}: max must be a number`;
        if (a.validMin && a.validMax && Number(a.validMin) > Number(a.validMax))
          return `${a.name}: min cannot exceed max`;
      }
      if (a.valueType === 'enum' && a.enumValues.length === 0)
        return `${a.name}: an enum needs at least one value`;
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

    const params: CreateProductDesignParams = {
      p_drawing_no: drawingNo.trim(),
      p_family: family.trim(),
      p_name: name.trim(),
      p_revision: revision,
      p_attributes: attributes.map((a) => ({
        name: a.name.trim(),
        value_type: a.valueType,
        unit: a.unit.trim() || null,
        required: a.required,
        qc_gate: a.qcGate,
        valid_min: a.validMin || null,
        valid_max: a.validMax || null,
        enum_values: a.valueType === 'enum' ? a.enumValues : null,
      })),
    };

    const { error: err } = await supabase.rpc('create_product_design', params);
    setSaving(false);
    if (err) setError(errorMessage(err));
    else navigate('/families');
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">New family</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Family</h2>
        <Field label="Drawing number">
          <input value={drawingNo} onChange={(e) => setDrawingNo(e.target.value)} className={inputClass} placeholder="WP-DECK-STD" />
        </Field>
        <Field label="Family">
          <input value={family} onChange={(e) => setFamily(e.target.value)} className={inputClass} placeholder="Platform Deck Panel" />
        </Field>
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Standard Platform Deck Panel" />
        </Field>
        <Field label="Revision">
          <input type="number" min={1} value={revision} onChange={(e) => setRevision(Number(e.target.value) || 1)} className={inputClass} />
        </Field>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Spec fields</h2>
        {attributes.map((attribute) => (
          <AttributeEditor
            key={attribute.key}
            attribute={attribute}
            onChange={(patch) => updateAttribute(attribute.key, patch)}
            onRemove={() => setAttributes((c) => c.filter((a) => a.key !== attribute.key))}
          />
        ))}
        <button
          type="button"
          onClick={() => setAttributes((c) => [...c, emptyAttribute()])}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          + Add field
        </button>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => navigate('/families')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

function AttributeEditor({
  attribute,
  onChange,
  onRemove,
}: {
  attribute: DraftAttribute;
  onChange: (patch: Partial<DraftAttribute>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">Field</span>
        <button type="button" onClick={onRemove} className="text-xs text-red-600 hover:underline">
          Remove
        </button>
      </div>

      <Field label="Field name">
        <PickOrAdd kind="field_name" value={attribute.name} onChange={(v) => onChange({ name: v })} />
      </Field>

      <Field label="Type">
        <select
          value={attribute.valueType}
          onChange={(e) => onChange({ valueType: e.target.value as SpecValueType })}
          className={inputClass}
        >
          {SELECTABLE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Unit (optional)">
        <PickOrAdd kind="unit" value={attribute.unit} onChange={(v) => onChange({ unit: v })} />
      </Field>

      {attribute.valueType === 'number' && (
        <div className="flex gap-2">
          <input
            placeholder="Min"
            value={attribute.validMin}
            onChange={(e) => onChange({ validMin: e.target.value })}
            className={inputClass}
          />
          <input
            placeholder="Max"
            value={attribute.validMax}
            onChange={(e) => onChange({ validMax: e.target.value })}
            className={inputClass}
          />
        </div>
      )}

      {attribute.valueType === 'enum' && (
        <EnumValuesEditor
          values={attribute.enumValues}
          onChange={(enumValues) => onChange({ enumValues })}
        />
      )}

      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={attribute.required} onChange={(e) => onChange({ required: e.target.checked })} />
          Required
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={attribute.qcGate} onChange={(e) => onChange({ qcGate: e.target.checked })} />
          QC gate
        </label>
      </div>
    </div>
  );
}

function EnumValuesEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-slate-500">Allowed values</span>
      {values.length > 0 && (
        <ul className="space-y-1">
          {values.map((value) => (
            <li key={value} className="flex items-center justify-between text-sm">
              <span>{value}</span>
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                className="text-xs text-red-600 hover:underline"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <PickOrAdd
        kind="enum_value"
        value=""
        placeholder="Add value"
        onChange={(v) => {
          if (v && !values.includes(v)) onChange([...values, v]);
        }}
      />
    </div>
  );
}
