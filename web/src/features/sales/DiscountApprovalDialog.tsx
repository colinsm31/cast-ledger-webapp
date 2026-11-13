import { useState, type FormEvent } from 'react';
import { approveDiscountAsAdmin } from '../../lib/discountApproval';
import { errorMessage } from '../../lib/errors';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// An admin signs in here to approve a discount over the staff limit. The
// register stays signed in as the staff member (see lib/discountApproval).
export function DiscountApprovalDialog({
  percent,
  staffLimit,
  onApproved,
  onCancel,
}: {
  /** How far below catalog the ticket goes, in percent. */
  percent: number;
  staffLimit: number | null;
  onApproved: (approvalId: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function approve(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const approvalId = await approveDiscountAsAdmin({ email, password, maxPercent: percent });
      setPassword('');
      onApproved(approvalId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Admin approval"
        onSubmit={(e) => void approve(e)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-slate-900">Admin approval</h2>
        <p className="text-sm text-slate-600">
          This ticket goes {percent}% below catalog price
          {staffLimit != null ? `, over the staff limit of ${staffLimit}%` : ''}. An admin can approve it by signing in
          here. You stay signed in, and the approval covers this ticket only.
        </p>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Admin email</span>
          <input
            autoFocus
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Password</span>
          <input
            type="password"
            autoComplete="off"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Approving…' : `Approve ${percent}% off`}
          </button>
        </div>
      </form>
    </div>
  );
}
