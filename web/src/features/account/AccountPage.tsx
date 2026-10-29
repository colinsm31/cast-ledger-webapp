import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import {
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  TEMPORARY_PASSWORD_FLAG,
  newPasswordProblem,
  usesTemporaryPassword,
} from '../../lib/passwordRules';
import { ROLE_LABEL } from '../../lib/staff';
import { useAuth } from '../../auth/AuthContext';
import { useBack } from '../../app/BackContext';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// The signed-in staff member's own account: who they are, and a place to
// change their password (replacing the temporary one an admin gave them).
export function AccountPage() {
  useBack('/');
  const { user, role } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);

  async function changePassword() {
    const email = user?.email;
    if (!email) return;
    setChanged(false);
    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    const problem = newPasswordProblem(newPassword, confirmation);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    // Check the current password first, so someone at a register left signed
    // in can't change it. A wrong password leaves the session as it is.
    const { error: checkError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (checkError) {
      setSaving(false);
      setError('Your current password is wrong.');
      return;
    }
    // current_password is also checked by the server where the project
    // requires it (ENVIRONMENTS.md).
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
      data: { [TEMPORARY_PASSWORD_FLAG]: false },
    });
    setSaving(false);
    if (updateError) {
      setError(errorMessage(updateError));
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setChanged(true);
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">My account</h1>

      <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm">
        <p className="text-slate-900">{user?.email ?? '—'}</p>
        <p className="capitalize text-slate-500">{role ? ROLE_LABEL[role] : '—'}</p>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-slate-700">Change password</h2>
        {usesTemporaryPassword(user?.user_metadata) && (
          <p className="text-sm text-amber-800">
            You're using the temporary password an admin gave you. Choose your own.
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Current password</span>
          <input
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">
            New password ({MIN_PASSWORD_LENGTH} to {MAX_PASSWORD_LENGTH} characters)
          </span>
          <input
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Confirm new password</span>
          <input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            type="password"
            autoComplete="new-password"
            className={inputClass}
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {changed && <p className="text-sm text-green-700">Password changed.</p>}

        <button
          onClick={() => void changePassword()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Changing…' : 'Change password'}
        </button>
      </section>
    </div>
  );
}
