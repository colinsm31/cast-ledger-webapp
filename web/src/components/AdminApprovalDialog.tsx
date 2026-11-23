import { useState, type FormEvent, type ReactNode } from 'react';
import type { AdminCredentials } from '../lib/discountApproval';
import { errorMessage } from '../lib/errors';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// An admin signs in here to approve something staff can't do alone (a big
// discount, a gift card load refund). The register stays signed in as the
// staff member (see lib/discountApproval).
export function AdminApprovalDialog({
  message,
  approveLabel,
  approve,
  onApproved,
  onCancel,
}: {
  /** What's being approved, shown above the sign-in fields. */
  message: ReactNode;
  /** The approve button's text, e.g. "Approve 30% off". */
  approveLabel: string;
  /** Signs the admin in and returns the approval's id (lib/discountApproval). */
  approve: (credentials: AdminCredentials) => Promise<string>;
  onApproved: (approvalId: string) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const approvalId = await approve({ email, password });
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
        onSubmit={(e) => void submit(e)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-bold text-slate-900">Admin approval</h2>
        <p className="text-sm text-slate-600">{message}</p>
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
            {busy ? 'Approving…' : approveLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
