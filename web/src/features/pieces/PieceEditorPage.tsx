import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import type {
  CreatePieceParams,
  JsonValue,
  Project,
  ProductDesign,
  SpecAttribute,
} from '../../types/domain';
import { Spinner } from '../../components/Spinner';

interface FieldValue {
  attribute: SpecAttribute;
  input: string;
}

function enumOptions(attribute: SpecAttribute): string[] {
  const raw = attribute.enum_values;
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  return [];
}

function fieldError(field: FieldValue): string | null {
  const { attribute, input } = field;
  const trimmed = input.trim();
  if (!trimmed) return attribute.required ? `${attribute.name} is required` : null;
  if (attribute.value_type === 'number') {
    const n = Number(trimmed);
    if (Number.isNaN(n)) return `${attribute.name} must be a number`;
    if (attribute.valid_min != null && n < attribute.valid_min)
      return `${attribute.name} must be ≥ ${attribute.valid_min}`;
    if (attribute.valid_max != null && n > attribute.valid_max)
      return `${attribute.name} must be ≤ ${attribute.valid_max}`;
  }
  if (attribute.value_type === 'enum') {
    const options = enumOptions(attribute);
    if (options.length > 0 && !options.includes(trimmed))
      return `${attribute.name} must be one of: ${options.join(', ')}`;
  }
  return null;
}

function toJson(field: FieldValue): JsonValue | undefined {
  const trimmed = field.input.trim();
  if (!trimmed) return undefined;
  switch (field.attribute.value_type) {
    case 'number':
      return Number(trimmed);
    case 'bool':
      return trimmed === 'true';
    default:
      return trimmed;
  }
}

export function PieceEditorPage() {
  const { designId } = useParams<{ designId: string }>();
  const navigate = useNavigate();

  const [design, setDesign] = useState<ProductDesign | null>(null);
  const [fields, setFields] = useState<FieldValue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [markNo, setMarkNo] = useState('');
  const [projectId, setProjectId] = useState('');
  const [weight, setWeight] = useState('');
  const [yardLocation, setYardLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!designId) return;
    void (async () => {
      setLoading(true);
      const [designRes, attrRes, projRes] = await Promise.all([
        supabase.from('product_designs').select('*').eq('id', designId).single(),
        supabase
          .from('spec_attributes')
          .select('*')
          .eq('owner_type', 'product_design')
          .eq('owner_id', designId)
          .order('created_at'),
        supabase.from('projects').select('*').order('job_number'),
      ]);
      if (designRes.error) setLoadError(errorMessage(designRes.error));
      else {
        setDesign(designRes.data as ProductDesign);
        setFields(((attrRes.data ?? []) as SpecAttribute[]).map((a) => ({ attribute: a, input: '' })));
        setProjects((projRes.data ?? []) as Project[]);
      }
      setLoading(false);
    })();
  }, [designId]);

  const validationError = useMemo(() => {
    if (!markNo.trim()) return 'Mark number is required';
    if (weight && Number.isNaN(Number(weight))) return 'Weight must be a number';
    for (const field of fields) {
      const err = fieldError(field);
      if (err) return err;
    }
    return null;
  }, [markNo, weight, fields]);

  function setFieldInput(attributeId: string, input: string) {
    setFields((current) =>
      current.map((f) => (f.attribute.id === attributeId ? { ...f, input } : f)),
    );
  }

  async function handleSave() {
    if (validationError || !designId) {
      setSaveError(validationError);
      return;
    }
    setSaving(true);
    setSaveError(null);

    const specValues: Record<string, JsonValue> = {};
    for (const field of fields) {
      const value = toJson(field);
      if (value !== undefined) specValues[field.attribute.name] = value;
    }

    const params: CreatePieceParams = {
      p_mark_no: markNo.trim(),
      p_product_design_id: designId,
      p_project_id: projectId || null,
      p_spec_values: specValues,
      p_weight_lb: weight ? Number(weight) : null,
      p_yard_location: yardLocation.trim() || null,
    };

    const { error: err } = await supabase.rpc('create_piece', params);
    setSaving(false);
    if (err) setSaveError(errorMessage(err));
    else navigate('/pieces');
  }

  if (loading) return <Spinner label="Loading template…" />;
  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">{design?.name ?? 'New piece'}</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Piece</h2>
        <Field label="Mark number">
          <input value={markNo} onChange={(e) => setMarkNo(e.target.value)} className={inputClass} placeholder="EVG-D14" />
        </Field>
        <Field label="Project">
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
            <option value="">Unassigned</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.job_number}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Weight (lb, optional)">
          <input value={weight} onChange={(e) => setWeight(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Yard location (optional)">
          <input value={yardLocation} onChange={(e) => setYardLocation(e.target.value)} className={inputClass} placeholder="Row C-7" />
        </Field>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Specs</h2>
        {fields.length === 0 && <p className="text-sm text-slate-500">This template has no spec fields.</p>}
        {fields.map((field) => (
          <SpecInput key={field.attribute.id} field={field} onChange={(v) => setFieldInput(field.attribute.id, v)} />
        ))}
      </section>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving || validationError !== null}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={() => navigate('/pieces/new')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
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

function SpecInput({ field, onChange }: { field: FieldValue; onChange: (value: string) => void }) {
  const { attribute, input } = field;
  const label = `${attribute.name}${attribute.unit ? ` (${attribute.unit})` : ''}${attribute.required ? ' *' : ''}`;
  const error = fieldError(field);

  return (
    <Field label={label}>
      {attribute.value_type === 'enum' && enumOptions(attribute).length > 0 ? (
        <select value={input} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Choose</option>
          {enumOptions(attribute).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : attribute.value_type === 'bool' ? (
        <select value={input} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Choose</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input value={input} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </Field>
  );
}
