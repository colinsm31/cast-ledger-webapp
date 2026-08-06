import type { AttributeDef, JsonValue } from '../../types/domain';
import { PickOrAdd } from '../lookups/PickOrAdd';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

function enumOptions(def: AttributeDef): string[] {
  return Array.isArray(def.enum_values)
    ? def.enum_values.filter((v): v is string => typeof v === 'string')
    : [];
}

// Renders the right control for one attribute definition. Every value except a
// yes/no is a pick-or-add dropdown (choose an existing value or add a new one
// that's remembered for next time), scoped to `lookupKind`. Values are held as
// strings by the caller; toStoredValue() converts to typed JSON for saving.
export function AttributeInput({
  def,
  value,
  onChange,
  lookupKind,
}: {
  def: AttributeDef;
  value: string;
  onChange: (value: string) => void;
  lookupKind: string;
}) {
  const label = `${def.name}${def.unit ? ` (${def.unit})` : ''}${def.required ? ' *' : ''}`;

  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {def.value_type === 'bool' ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">Choose</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <PickOrAdd
          kind={lookupKind}
          value={value}
          onChange={onChange}
          baseOptions={enumOptions(def)}
        />
      )}
    </label>
  );
}

// Convert a string input to the typed JSON value for storage, or undefined to omit.
export function toStoredValue(def: AttributeDef, raw: string): JsonValue | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  switch (def.value_type) {
    case 'number': {
      const n = Number(trimmed);
      return Number.isNaN(n) ? undefined : n;
    }
    case 'bool':
      return trimmed === 'true';
    default:
      return trimmed;
  }
}

// Display a stored JSON value as a string.
export function displayStored(value: JsonValue): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(displayStored).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
