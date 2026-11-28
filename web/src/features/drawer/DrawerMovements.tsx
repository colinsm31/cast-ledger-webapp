import { useState } from 'react';
import { formatDateTimeShort } from '../../lib/dates';
import {
  MOVEMENT_REASON_MAX,
  parseMovementAmount,
  recordMovement,
  type DrawerMovement,
  type DrawerMovementKind,
} from '../../lib/drawers';
import { errorMessage } from '../../lib/errors';
import { formatMoney } from '../../lib/money';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const KIND_LABELS: Record<DrawerMovementKind, string> = { paid_in: 'Paid in', paid_out: 'Paid out' };

// Cash put into or taken out of an open drawer outside a sale (change from the
// bank, stamps bought from the drawer), and the list of what's been recorded.
export function DrawerMovements({
  sessionId,
  movements,
  onRecorded,
}: {
  sessionId: string;
  movements: DrawerMovement[];
  onRecorded: () => void;
}) {
  const [kind, setKind] = useState<DrawerMovementKind>('paid_out');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    const parsed = parseMovementAmount(amount);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await recordMovement(sessionId, kind, parsed.amount, reason);
      setAmount('');
      setReason('');
      onRecorded();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 p-3">
      <h3 className="text-sm font-semibold text-slate-700">Paid in / paid out</h3>
      {movements.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-600">
          {movements.map((movement) => (
            <li key={movement.id} className="flex flex-wrap gap-x-2">
              <span className="w-20 shrink-0">{KIND_LABELS[movement.kind]}</span>
              <span className="w-20 shrink-0 text-right">{formatMoney(movement.amount)}</span>
              <span className="text-slate-500">{movement.reason ?? '(no reason)'}</span>
              <span className="ml-auto text-xs text-slate-400">{formatDateTimeShort(movement.created_at)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex gap-1 rounded-lg border border-slate-300 bg-white p-1" role="group" aria-label="Paid in or out">
          {(Object.keys(KIND_LABELS) as DrawerMovementKind[]).map((value) => (
            <button
              key={value}
              onClick={() => setKind(value)}
              aria-pressed={kind === value}
              className={kind === value ? 'rounded bg-blue-600 px-2 py-1 text-sm text-white' : 'rounded px-2 py-1 text-sm text-slate-700'}
            >
              {KIND_LABELS[value]}
            </button>
          ))}
        </div>
        <label className="w-28 space-y-1">
          <span className="text-xs font-medium text-slate-500">Amount</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className={inputClass} />
        </label>
        <label className="min-w-40 flex-1 space-y-1">
          <span className="text-xs font-medium text-slate-500">Reason (optional)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MOVEMENT_REASON_MAX} className={inputClass} />
        </label>
        <button
          onClick={() => void record()}
          disabled={saving}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          {saving ? 'Recording…' : `Record ${KIND_LABELS[kind].toLowerCase()}`}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </section>
  );
}
