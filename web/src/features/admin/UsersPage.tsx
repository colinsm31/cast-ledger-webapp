import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseAnonKey, supabaseUrl } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { useAuth, type Role } from '../../auth/AuthContext';
import { Spinner } from '../../components/Spinner';

interface Profile {
  id: string;
  email: string | null;
  role: Role;
}

export function UsersPage() {
  const { user } = useAuth();
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

  async function setRole(id: string, role: Role) {
    setBusyId(id);
    setError(null);
    const { error: err } = await supabase.rpc('set_user_role', { p_user_id: id, p_role: role });
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
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    p.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {p.role}
                </span>
              </div>
              <button
                onClick={() => void setRole(p.id, p.role === 'admin' ? 'staff' : 'admin')}
                disabled={busyId === p.id}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {p.role === 'admin' ? 'Make staff' : 'Make admin'}
              </button>
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
    if (!email.trim() || password.length < 6) {
      onError('Enter an email and a password of at least 6 characters.');
      return;
    }
    setSaving(true);
    onError('');
    // Sign up on a throwaway client so the admin's own session is untouched.
    const tmp = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await tmp.auth.signUp({ email: email.trim(), password });
    setSaving(false);
    if (error) {
      onError(errorMessage(error));
      return;
    }
    setEmail('');
    setPassword('');
    setOpen(false);
    setNotice('Staff account created. If email confirmation is enabled, they must confirm before signing in.');
    await onAdded();
  }

  if (!open) {
    return (
      <div className="space-y-2">
        <button
          onClick={() => setOpen(true)}
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
        placeholder="Temporary password (min 6 chars)"
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
