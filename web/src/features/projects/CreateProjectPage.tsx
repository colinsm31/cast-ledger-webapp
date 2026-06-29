import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';

export function CreateProjectPage() {
  const navigate = useNavigate();
  const [jobNumber, setJobNumber] = useState('');
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = jobNumber.trim().length > 0 && name.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) {
      setError('Job number and name are required');
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('projects')
      .insert({
        job_number: jobNumber.trim(),
        name: name.trim(),
        client: client.trim() || null,
        location: location.trim() || null,
      })
      .select('id')
      .single();
    setSaving(false);
    if (err) {
      setError(
        errorMessage(err).includes('duplicate')
          ? 'A project with this job number already exists.'
          : errorMessage(err),
      );
      return;
    }
    navigate(`/projects/${data.id}`);
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-bold text-slate-900">New project</h1>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <Field label="Job number *">
          <input value={jobNumber} onChange={(e) => setJobNumber(e.target.value)} className={inputClass} placeholder="EVG-2026" />
        </Field>
        <Field label="Name *">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Entergy Evergreen Platform" />
        </Field>
        <Field label="Client">
          <input value={client} onChange={(e) => setClient(e.target.value)} className={inputClass} placeholder="Entergy" />
        </Field>
        <Field label="Location">
          <input value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="Evergreen, LA" />
        </Field>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={() => void handleSave()}
          disabled={!canSave}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Create project'}
        </button>
        <button onClick={() => navigate('/projects')} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
