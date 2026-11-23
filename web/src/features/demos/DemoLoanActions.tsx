import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { checkInProblem, demoDueProblem } from '../../lib/demoLoans';
import { fromLocalInput, toLocalInput } from '../../lib/stringJobPromise';
import type { DemoLoan } from '../../types/domain';
import { demoInputClass } from './LendDemoForm';

type Mode = 'idle' | 'checkIn' | 'due';

// MARK: - DemoLoanActions
//
// Check a lent demo back in (to the demo fleet, or retired with a reason) or
// give it a new due time (0071). Used on the frame's row and the Demos page.
export function DemoLoanActions({
  loan,
  onChanged,
}: {
  loan: Pick<DemoLoan, 'id' | 'due_back_at'>;
  onChanged: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [to, setTo] = useState<'demo' | 'retired'>('demo');
  const [reason, setReason] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = mode === 'checkIn' ? checkInProblem(to, reason) : mode === 'due' ? demoDueProblem(due, new Date()) : null;

  function open(next: Mode) {
    setMode(next);
    setTo('demo');
    setReason('');
    setDue(toLocalInput(new Date(loan.due_back_at)));
    setError(null);
  }

  async function save() {
    if (problem) return;
    setSaving(true);
    setError(null);
    const { error: err } =
      mode === 'checkIn'
        ? await supabase.rpc('check_in_demo', { p_loan_id: loan.id, p_status: to, p_reason: reason.trim() || null })
        : await supabase.rpc('set_demo_due', { p_loan_id: loan.id, p_due_back_at: fromLocalInput(due)?.toISOString() });
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setMode('idle');
    await onChanged();
  }

  if (mode === 'idle') {
    return (
      <span className="flex flex-wrap items-center gap-3">
        <button onClick={() => open('checkIn')} className="text-xs font-medium text-blue-600 hover:underline">
          Check in
        </button>
        <button onClick={() => open('due')} className="text-xs font-medium text-slate-600 hover:text-blue-700 hover:underline">
          Change due date
        </button>
      </span>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg bg-slate-50 p-2">
      {mode === 'checkIn' ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-1">
            <input type="radio" checked={to === 'demo'} onChange={() => setTo('demo')} />
            Back to the demo fleet
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" checked={to === 'retired'} onChange={() => setTo('retired')} />
            Damaged: retire it
          </label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={to === 'retired' ? 'Why? e.g. cracked throat' : 'Note (optional)'}
            className={`${demoInputClass} min-w-[12rem] flex-1`}
          />
        </div>
      ) : (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-xs font-medium text-slate-600">Due back</span>
          <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} className={demoInputClass} />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void save()}
          disabled={saving || !!problem}
          className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : mode === 'checkIn' ? 'Check in' : 'Save due date'}
        </button>
        <button onClick={() => setMode('idle')} className="rounded-lg border border-slate-300 px-3 py-1 text-sm">
          Cancel
        </button>
        {problem && <span className="text-xs text-amber-700">{problem}</span>}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
