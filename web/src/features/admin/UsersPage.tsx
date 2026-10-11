import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { invokeEdgeFunction } from '../../lib/edgeFunctions';
import { useAuth, type Role } from '../../auth/AuthContext';
import { useDialog } from '../../components/Dialog';
import { Spinner } from '../../components/Spinner';
import { useBack } from '../../app/BackContext';

// Matches the create-staff Edge Function's minimum.
const MIN_PASSWORD_LENGTH = 8;

interface Profile {
  id: string;
  email: string | null;
  role: Role;
}

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-blue-100 text-blue-800',
  staff: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-800',
};

const ROLE_LABEL: Record<Role, string> = {
  admin: 'admin',
  staff: 'staff',
  pending: 'no access',
};

// The role changes an admin can make from each role.
const ROLE_ACTIONS: Record<Role, { label: string; to: Role }[]> = {
  pending: [{ label: 'Approve as staff', to: 'staff' }],
  staff: [
    { label: 'Make admin', to: 'admin' },
    { label: 'Remove access', to: 'pending' },
  ],
  admin: [{ label: 'Make staff', to: 'staff' }],
};

export function UsersPage() {
  const { user } = useAuth();
  const { confirm } = useDialog();
  useBack('/');
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, role')
      .order('email');
    if (err) setError(errorMessage(err));
    else setProfiles((data ?? []) as Profile[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setRole(profile: Profile, role: Role) {
    if (role === 'pending') {
      const ok = await confirm({
        title: 'Remove access?',
        message: `${profile.email ?? 'This account'} will be signed out of the shop's data immediately. You can approve them again later.`,
        confirmLabel: 'Remove access',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(profile.id);
    setError(null);
    const { error: err } = await supabase.rpc('set_user_role', { p_user_id: profile.id, p_role: role });
    setBusyId(null);
    if (err) setError(errorMessage(err));
    else await load();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">Users</h1>

      <AddStaff onAdded={load} onError={setError} />

      {error && <p className="text-sm text-red-600">{error}</p>}
      {profiles === null && !error && <Spinner label="Loading…" />}
      {profiles && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3">
              <div>
                <p className="font-medium text-slate-900">
                  {p.email ?? '—'}
                  {p.id === user?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_BADGE[p.role]}`}>
                  {ROLE_LABEL[p.role]}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                {ROLE_ACTIONS[p.role].map((action) => (
                  <button
                    key={action.to}
                    onClick={() => void setRole(p, action.to)}
                    disabled={busyId === p.id}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                      action.to === 'pending'
                        ? 'border-red-300 text-red-700 hover:bg-red-50'
                        : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddStaff({ onAdded, onError }: { onAdded: () => Promise<void>; onError: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function add() {
    if (!email.trim() || password.length < MIN_PASSWORD_LENGTH) {
      onError(`Enter an email and a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    setSaving(true);
    onError('');
    try {
      // Created server-side by an admin-only Edge Function: public sign-up is off.
      await invokeEdgeFunction('create-staff', { email: email.trim(), password });
    } catch (err) {
      onError(errorMessage(err));
      return;
    } finally {
      setSaving(false);
    }
    setNotice(`Staff account created for ${email.trim()}. They can sign in now with the temporary password.`);
    setEmail('');
    setPassword('');
    setOpen(false);
    await onAdded();
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => {
            setNotice(null);
            setOpen(true);
          }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Add staff account
        </button>
        {notice && <p className="text-sm text-green-700">{notice}</p>}
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">New staff account</h2>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        inputMode="email"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={`Temporary password (min ${MIN_PASSWORD_LENGTH} chars)`}
        type="password"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={() => void add()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create'}
        </button>
        <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}
