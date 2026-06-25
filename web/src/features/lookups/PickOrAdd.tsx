import { useState } from 'react';
import type { LookupKind } from '../../types/domain';
import { useLookups } from './useLookups';

// A select of existing lookup values with an inline "add new" option that saves
// immediately to the shared list.
export function PickOrAdd({
  kind,
  value,
  onChange,
  placeholder = 'Choose',
}: {
  kind: LookupKind;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const { values, addValue } = useLookups(kind);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  async function commitNew() {
    const canonical = await addValue(draft);
    if (canonical) onChange(canonical);
    setDraft('');
    setAdding(false);
  }

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="New value"
          className="flex-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={() => void commitNew()}
          disabled={!draft.trim()}
          className="rounded-lg bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => { setAdding(false); setDraft(''); }}
          className="rounded-lg border border-slate-300 px-3 py-1 text-sm"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === '__add__') setAdding(true);
        else onChange(e.target.value);
      }}
      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white"
    >
      <option value="">{placeholder}</option>
      {values.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
      <option value="__add__">+ Add new…</option>
    </select>
  );
}
