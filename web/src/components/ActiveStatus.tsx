import { useState } from 'react';
import type { Deactivation } from '../types/domain';
import { errorMessage } from '../lib/errors';

// The database's limit on the reason (set_customer_active, set_gift_card_active, 0076).
const REASON_MAX = 200;

/** A small "Inactive" tag shown next to a name or code. */
export function InactiveBadge() {
  return (
    <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 align-middle text-xs font-semibold text-slate-700">
      Inactive
    </span>
  );
}

/**
 * Whether a customer or gift card is active, and the control that turns it
 * off (with a reason) or back on. An inactive record stays in history but
 * can't be used at the register.
 */
export function ActiveStatusPanel({
  noun,
  isActive,
  deactivation,
  setActive,
  onChanged,
}: {
  /** "customer" or "gift card". */
  noun: string;
  isActive: boolean;
  deactivation: Deactivation;
  /** Calls the database; throws when it refuses. */
  setActive: (active: boolean, reason: string | null) => Promise<void>;
  onChanged: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(active: boolean) {
    const trimmed = reason.trim();
    if (!active && !trimmed) {
      setError(`Say why the ${noun} is inactive.`);
      return;
    }
    if (trimmed.length > REASON_MAX) {
      setError(`Keep the reason to ${REASON_MAX} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setActive(active, active ? null : trimmed);
      setAsking(false);
      setReason('');
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!isActive) {
    return (
      <section className="space-y-2 rounded-xl border border-slate-300 bg-slate-50 p-4">
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Inactive</span>
          {deactivation.deactivated_reason ? `: ${deactivation.deactivated_reason}` : ''}
          {deactivation.deactivated_at ? ` · since ${new Date(deactivation.deactivated_at).toLocaleDateString()}` : ''}
        </p>
        <p className="text-xs text-slate-500">Its history is kept, but it can&apos;t be used at the register.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={() => void change(true)}
          disabled={busy}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Make active again
        </button>
      </section>
    );
  }

  if (!asking) {
    return (
      <button onClick={() => setAsking(true)} className="text-sm text-slate-500 hover:text-red-700 hover:underline">
        Make this {noun} inactive…
      </button>
    );
  }

  return (
    <section className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-600">Why is this {noun} inactive?</span>
        <input
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={REASON_MAX}
          placeholder="e.g. lost, moved away, duplicate"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void change(false)}
          disabled={busy}
          className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          Make inactive
        </button>
        <button
          onClick={() => {
            setAsking(false);
            setError(null);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
