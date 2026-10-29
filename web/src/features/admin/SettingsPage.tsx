import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { fetchSettings, parseSettingsForm, settingsToForm } from '../../lib/settings';
import type { SettingsForm } from '../../lib/settings';
import { useAuth } from '../../auth/AuthContext';
import { Spinner } from '../../components/Spinner';
import { LoadError } from '../../components/LoadError';
import { useBack } from '../../app/BackContext';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function SettingsPage() {
  useBack('/');
  const { refreshRole } = useAuth();
  // Null until loaded; the form is never shown over values that failed to load.
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setForm(settingsToForm(await fetchSettings()));
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update(changes: Partial<SettingsForm>) {
    setForm((current) => (current ? { ...current, ...changes } : current));
    setSaved(false);
  }

  async function save() {
    if (!form) return;
    setSaved(false);
    const parsed = parseSettingsForm(form);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('settings')
      .update({ ...parsed.settings, updated_at: new Date().toISOString() })
      .eq('id', true)
      .select('id');
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
    } else if (!data || data.length === 0) {
      // The database saved nothing: this account is no longer an admin (#33).
      setError('Settings weren\'t saved: only admins can change settings.');
      await refreshRole();
    } else {
      setSaved(true);
    }
  }

  if (loadError) {
    return (
      <div className="max-w-xl space-y-6">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <LoadError message={loadError} onRetry={() => void load()} />
      </div>
    );
  }
  if (!form) return <Spinner label="Loading…" />;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Taxes</h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Sales tax rate (%)</span>
          <input value={form.taxRate} onChange={(e) => update({ taxRate: e.target.value })} inputMode="decimal" className={inputClass} placeholder="0" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.taxStringing} onChange={(e) => update({ taxStringing: e.target.checked })} />
          Charge tax on stringing services
        </label>
        <p className="text-xs text-slate-400">Products are always taxed at this rate; gift card loads are never taxed.</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Stringing</h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Base labor charge</span>
          <input value={form.stringingLabor} onChange={(e) => update({ stringingLabor: e.target.value })} inputMode="decimal" className={inputClass} placeholder="0.00" />
        </label>
        <p className="text-xs text-slate-400">Added on top of the string price when pricing a string job.</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Inventory</h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Default reorder point for new products</span>
          <input value={form.defaultReorder} onChange={(e) => update({ defaultReorder: e.target.value })} inputMode="numeric" className={inputClass} placeholder="(none)" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.blockOversell} onChange={(e) => update({ blockOversell: e.target.checked })} />
          Block selling a product below 0 on hand
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Reports</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.weekStartsMonday} onChange={(e) => update({ weekStartsMonday: e.target.checked })} />
          Week starts on Monday (otherwise Sunday)
        </label>
        <p className="text-xs text-slate-400">Affects the “Week to date” period on the sales report.</p>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-green-700">Settings saved.</p>}

      <button
        onClick={() => void save()}
        disabled={saving}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}
