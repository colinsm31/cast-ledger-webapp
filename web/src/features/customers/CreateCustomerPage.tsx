import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function CreateCustomerPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!firstName.trim() || !lastName.trim()) {
      setError('First and last name are required');
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('customers')
      .insert({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phone.trim() || null,
        email: email.trim() || null,
      })
      .select('id')
      .single();
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    navigate(`/customers/${data.id}`);
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">New customer</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex gap-2">
          <Field label="First name *">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Last name *">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field label="Phone number">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} inputMode="tel" />
        </Field>
        <Field label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} inputMode="email" />
        </Field>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Create customer'}
        </button>
        <button onClick={() => navigate('/customers')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block flex-1 space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
