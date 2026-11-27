import { useCallback, useEffect, useState } from 'react';
import { LoadError } from '../../components/LoadError';
import { DRAWER_NAME_MAX, fetchDrawers, type Drawer } from '../../lib/drawers';
import { errorMessage } from '../../lib/errors';
import { supabase } from '../../lib/supabase';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// The shop's cash drawers (admins): add one, rename it, or take it out of use.
// Each saves on its own, apart from the settings form.
export function DrawersSettings() {
  const [drawers, setDrawers] = useState<Drawer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped after a failed write so the name boxes show the saved names again.
  const [version, setVersion] = useState(0);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setDrawers(await fetchDrawers());
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(write: () => PromiseLike<{ error: unknown }>) {
    setBusy(true);
    setError(null);
    const { error: err } = await write();
    if (err) setError(errorMessage(err));
    await load();
    if (err) setVersion((count) => count + 1);
    setBusy(false);
    return !err;
  }

  async function add() {
    const name = newName.trim();
    if (!name) {
      setError('Drawer name: enter a name, like "Front register".');
      return;
    }
    if (await run(() => supabase.from('drawers').insert({ name }))) setNewName('');
  }

  async function rename(drawer: Drawer, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === drawer.name) return;
    await run(() => supabase.from('drawers').update({ name: trimmed }).eq('id', drawer.id));
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Cash drawers</h2>
      <p className="text-xs text-slate-400">
        Each register picks its drawer on the Cash drawer screen. A drawer out of use can&apos;t be opened, and an
        open drawer has to be counted and closed before it&apos;s taken out of use.
      </p>
      {loadError && <LoadError message={loadError} onRetry={() => void load()} />}
      <ul className="space-y-2">
        {drawers?.map((drawer) => (
          <li key={drawer.id} className="flex items-center gap-2">
            <input
              key={`${drawer.name}-${version}`}
              aria-label={`Name of ${drawer.name}`}
              defaultValue={drawer.name}
              maxLength={DRAWER_NAME_MAX}
              onBlur={(e) => void rename(drawer, e.target.value)}
              className={inputClass}
            />
            <label className="flex shrink-0 items-center gap-1 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={drawer.is_active}
                disabled={busy}
                onChange={(e) => void run(() => supabase.from('drawers').update({ is_active: e.target.checked }).eq('id', drawer.id))}
              />
              In use
            </label>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          aria-label="New drawer name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={DRAWER_NAME_MAX}
          placeholder="New drawer name"
          className={inputClass}
        />
        <button
          onClick={() => void add()}
          disabled={busy}
          className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add drawer'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
