import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { useCustomerMatches } from '../../lib/customerSearch';
import { defaultDemoDue, demoDueProblem, demoNoteProblem } from '../../lib/demoLoans';
import { useSettings } from '../../lib/settings';
import { fromLocalInput, toLocalInput } from '../../lib/stringJobPromise';
import type { Customer } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';

export const demoInputClass = 'rounded-lg border border-slate-300 px-2 py-1 text-sm';

// MARK: - LendDemoForm
//
// Lend a demo frame: who's borrowing it, when it's due back (the shop's demo
// loan days by default), and a note of any deposit held (0071).
export function LendDemoForm({
  unitId,
  onLent,
  onCancel,
}: {
  unitId: string;
  onLent: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const { settings } = useSettings();
  const [query, setQuery] = useState('');
  const matches = useCustomerMatches(query);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [due, setDue] = useState('');
  const [deposit, setDeposit] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings && !due) setDue(toLocalInput(defaultDemoDue(new Date(), settings.demo_loan_days)));
  }, [settings, due]);

  const problem = !customer
    ? 'Pick the customer borrowing the demo.'
    : demoDueProblem(due, new Date()) ?? demoNoteProblem(deposit) ?? demoNoteProblem(note);

  async function lend() {
    if (problem || !customer) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.rpc('check_out_demo', {
      p_unit_id: unitId,
      p_customer_id: customer.id,
      p_due_back_at: fromLocalInput(due)?.toISOString(),
      p_deposit_note: deposit.trim() || null,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    await onLent();
  }

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-2">
      {customer ? (
        <p className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium text-slate-600">Lend to</span>
          <span className="font-medium text-slate-900">{customerNameLastFirst(customer)}</span>
          <button onClick={() => setCustomer(null)} className="text-xs text-blue-600 hover:underline">
            Change
          </button>
        </p>
      ) : (
        <div className="space-y-1">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Lend to: search customer name or phone…"
            className={`${demoInputClass} w-full`}
          />
          {query.trim() && (
            <ul className="divide-y divide-slate-100 rounded-lg bg-white">
              {matches.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setCustomer(c)}
                    className="flex w-full justify-between px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{customerNameLastFirst(c)}</span>
                    <span className="text-slate-500">{c.phone_number}</span>
                  </button>
                </li>
              ))}
              {matches.length === 0 && <li className="px-2 py-1.5 text-sm text-slate-500">No matches.</li>}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-0.5">
          <span className="block text-xs font-medium text-slate-600">Due back</span>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={demoInputClass} />
        </label>
        <label className="min-w-[12rem] flex-1 space-y-0.5">
          <span className="block text-xs font-medium text-slate-600">Deposit held (note)</span>
          <input
            value={deposit}
            onChange={(e) => setDeposit(e.target.value)}
            placeholder="e.g. card on file, $50 cash"
            className={`${demoInputClass} w-full`}
          />
        </label>
        <label className="min-w-[12rem] flex-1 space-y-0.5">
          <span className="block text-xs font-medium text-slate-600">Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={`${demoInputClass} w-full`} />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void lend()}
          disabled={saving || !!problem}
          className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Lending…' : 'Lend demo'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
          Cancel
        </button>
        {problem && customer && <span className="text-xs text-amber-700">{problem}</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
