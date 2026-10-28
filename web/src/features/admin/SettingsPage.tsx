import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { fetchSettings } from '../../lib/settings';
import { subCentError } from '../../lib/money';
import { Spinner } from '../../components/Spinner';
import { useBack } from '../../app/BackContext';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function SettingsPage() {
  useBack('/');
  const [loading, setLoading] = useState(true);
  const [taxRate, setTaxRate] = useState('');
  const [taxStringing, setTaxStringing] = useState(false);
  const [stringingLabor, setStringingLabor] = useState('');
  const [defaultReorder, setDefaultReorder] = useState('');
  const [blockOversell, setBlockOversell] = useState(false);
  const [weekStartsMonday, setWeekStartsMonday] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const s = await fetchSettings();
      setTaxRate(String(s.tax_rate));
      setTaxStringing(s.tax_stringing);
      setStringingLabor(String(s.stringing_labor));
      setDefaultReorder(s.default_reorder_point != null ? String(s.default_reorder_point) : '');
      setBlockOversell(s.block_oversell);
      setWeekStartsMonday(s.week_starts_monday);
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaved(false);
    const subCent = subCentError({ 'Stringing labor': stringingLabor });
    if (subCent) {
      setError(subCent);
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('settings')
      .update({
        tax_rate: Number(taxRate) || 0,
        tax_stringing: taxStringing,
        stringing_labor: Number(stringingLabor) || 0,
        default_reorder_point: defaultReorder.trim() ? Number(defaultReorder) : null,
        block_oversell: blockOversell,
        week_starts_monday: weekStartsMonday,
        updated_at: new Date().toISOString(),
      })
      .eq('id', true);
    setSaving(false);
    if (err) setError(errorMessage(err));
    else setSaved(true);
  }

  if (loading) return <Spinner label="Loading…" />;

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Settings</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Taxes</h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Sales tax rate (%)</span>
          <input value={taxRate} onChange={(e) => setTaxRate(e.target.value)} inputMode="decimal" className={inputClass} placeholder="0" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={taxStringing} onChange={(e) => setTaxStringing(e.target.checked)} />
          Charge tax on stringing services
        </label>
        <p className="text-xs text-slate-400">Products are always taxed at this rate; gift card loads are never taxed.</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Stringing</h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Base labor charge</span>
          <input value={stringingLabor} onChange={(e) => setStringingLabor(e.target.value)} inputMode="decimal" className={inputClass} placeholder="0.00" />
        </label>
        <p className="text-xs text-slate-400">Added on top of the string price when pricing a string job.</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Inventory</h2>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Default reorder point for new products</span>
          <input value={defaultReorder} onChange={(e) => setDefaultReorder(e.target.value)} inputMode="numeric" className={inputClass} placeholder="(none)" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={blockOversell} onChange={(e) => setBlockOversell(e.target.checked)} />
          Block selling a product below 0 on hand
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Reports</h2>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={weekStartsMonday} onChange={(e) => setWeekStartsMonday(e.target.checked)} />
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
