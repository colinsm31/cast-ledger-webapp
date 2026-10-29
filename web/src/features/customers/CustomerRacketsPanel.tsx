import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { CustomerRacket, ProductWithCategory } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { useDialog } from '../../components/Dialog';
import { LoadError } from '../../components/LoadError';
import { useLatestRequest } from '../../lib/latestRequest';

// Standard tennis grip sizes.
const GRIP_SIZES = ['4 1/8', '4 1/4', '4 3/8', '4 1/2', '4 5/8'];

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

interface RacketDraft {
  productId: string;
  brand: string;
  model: string;
  gripSize: string;
  barcode: string;
  notes: string;
}

const emptyDraft: RacketDraft = {
  productId: '',
  brand: '',
  model: '',
  gripSize: '',
  barcode: '',
  notes: '',
};

export function CustomerRacketsPanel({
  customerId,
  prefillBarcode,
}: {
  customerId: string;
  /** A scanned barcode to register: opens the add form with it filled in. */
  prefillBarcode?: string;
}) {
  const navigate = useNavigate();
  const { confirm } = useDialog();
  const [rackets, setRackets] = useState<CustomerRacket[] | null>(null);
  const [catalogRackets, setCatalogRackets] = useState<ProductWithCategory[]>([]);
  // racket id → id of its open (entered/complete) string job, if any.
  const [openJobByRacket, setOpenJobByRacket] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // A failed load of the racquets, the catalog or the open jobs. Without the
  // open jobs, removing a racquet with a job in progress wouldn't be stopped,
  // so a failure is shown rather than read as "none" (#36).
  const [loadError, setLoadError] = useState<string | null>(null);
  const startRequest = useLatestRequest();
  const [adding, setAdding] = useState(Boolean(prefillBarcode));
  // Consumed once the racket is saved so a second "Add racket" starts blank.
  const [pendingBarcode, setPendingBarcode] = useState(prefillBarcode ?? '');
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const isLatest = startRequest();
    const [racketsRes, catalogRes, jobsRes] = await Promise.all([
      supabase
        .from('customer_rackets')
        .select('*')
        .eq('customer_id', customerId)
        .eq('is_active', true)
        .order('created_at'),
      supabase.from('products').select('*, categories(name)').order('brand'),
      supabase
        .from('string_jobs')
        .select('id, customer_racket_id, customer_rackets!inner(customer_id)')
        .eq('customer_rackets.customer_id', customerId)
        .in('status', ['entered', 'complete'])
        .order('entered_at', { ascending: false }),
    ]);
    if (!isLatest()) return;
    const failure = racketsRes.error ?? catalogRes.error ?? jobsRes.error;
    setLoadError(failure ? `Couldn't load the racquets: ${errorMessage(failure)}` : null);
    if (failure) return;
    setRackets((racketsRes.data ?? []) as CustomerRacket[]);
    // Only catalog products in the Rackets category are pickable.
    const cat = ((catalogRes.data ?? []) as unknown as ProductWithCategory[]).filter(
      (p) => p.categories?.name === 'Rackets',
    );
    setCatalogRackets(cat);

    // Latest open job per racket (rows arrive newest-first).
    const openJobs: Record<string, string> = {};
    for (const j of (jobsRes.data ?? []) as { id: string; customer_racket_id: string }[]) {
      if (!openJobs[j.customer_racket_id]) openJobs[j.customer_racket_id] = j.id;
    }
    setOpenJobByRacket(openJobs);
  }, [customerId, startRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  // Closing a racket form (saved or cancelled) drops any error it raised.
  function closeForm(close: () => void) {
    setError(null);
    close();
  }

  // Removing retires the racket (is_active = false) rather than deleting it, so
  // its stringing history stays on the customer's record and its tag barcode
  // is freed for another racket.
  async function remove(racket: CustomerRacket) {
    setError(null);
    if (openJobByRacket[racket.id]) {
      setError('This racket has an open string job. Deliver or cancel the job before removing the racket.');
      return;
    }
    const ok = await confirm({
      title: 'Remove racket?',
      message: `${racket.brand ? `${racket.brand} ` : ''}${racket.model} will no longer be listed for this customer. Its stringing history is kept${racket.barcode ? `, and tag ${racket.barcode} can be reused` : ''}.`,
      confirmLabel: 'Remove racket',
      tone: 'danger',
    });
    if (!ok) return;
    const { error: err } = await supabase.from('customer_rackets').update({ is_active: false }).eq('id', racket.id);
    if (err) setError(errorMessage(err));
    else await load();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Rackets owned</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Add racket
          </button>
        )}
      </div>

      {loadError && <LoadError message={loadError} onRetry={() => void load()} />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {adding && (
        <RacketForm
          customerId={customerId}
          catalogRackets={catalogRackets}
          initialBarcode={pendingBarcode}
          onCancel={() => closeForm(() => setAdding(false))}
          onSaved={async () => {
            closeForm(() => setAdding(false));
            setPendingBarcode('');
            await load();
          }}
          onError={setError}
        />
      )}

      {rackets && rackets.length === 0 && !adding && (
        <p className="text-sm text-slate-500">No rackets recorded for this customer yet.</p>
      )}

      {rackets && rackets.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {rackets.map((racket) =>
            editingId === racket.id ? (
              <li key={racket.id} className="p-3">
                <RacketForm
                  customerId={customerId}
                  catalogRackets={catalogRackets}
                  existing={racket}
                  onCancel={() => closeForm(() => setEditingId(null))}
                  onSaved={async () => {
                    closeForm(() => setEditingId(null));
                    await load();
                  }}
                  onError={setError}
                />
              </li>
            ) : (
              <li key={racket.id} className="flex items-start justify-between gap-3 p-3">
                <div>
                  <p className="font-medium text-slate-900">
                    {racket.brand ? `${racket.brand} ` : ''}
                    {racket.model}
                    {racket.barcode ? <span className="text-slate-400"> · {racket.barcode}</span> : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {racket.grip_size ? `Grip ${racket.grip_size}` : 'Grip —'}
                  </p>
                  {racket.notes && <p className="mt-1 text-xs text-slate-500">{racket.notes}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {openJobByRacket[racket.id] ? (
                    <button
                      onClick={() => navigate(`/string-jobs/${openJobByRacket[racket.id]}`)}
                      className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      View string job
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        navigate(`/customers/${customerId}/rackets/${racket.id}/restring`)
                      }
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-900"
                    >
                      New string job
                    </button>
                  )}
                  <button
                    onClick={() => setEditingId(racket.id)}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void remove(racket)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

// MARK: - Add / edit racket form

function RacketForm({
  customerId,
  catalogRackets,
  existing,
  initialBarcode,
  onCancel,
  onSaved,
  onError,
}: {
  customerId: string;
  catalogRackets: ProductWithCategory[];
  existing?: CustomerRacket;
  /** Prefilled barcode for a new racket (from a scan). */
  initialBarcode?: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<RacketDraft>(
    existing
      ? {
          productId: existing.product_id ?? '',
          brand: existing.brand ?? '',
          model: existing.model,
          gripSize: existing.grip_size ?? '',
          barcode: existing.barcode ?? '',
          notes: existing.notes ?? '',
        }
      : { ...emptyDraft, barcode: initialBarcode ?? '' },
  );
  const [saving, setSaving] = useState(false);

  function patch(p: Partial<RacketDraft>) {
    setDraft((prev) => ({ ...prev, ...p }));
  }

  // Picking a catalog racket prefills brand + model.
  function pickCatalog(productId: string) {
    if (!productId) {
      patch({ productId: '' });
      return;
    }
    const product = catalogRackets.find((p) => p.id === productId);
    patch({
      productId,
      brand: product?.brand ?? draft.brand,
      model: product?.name ?? draft.model,
    });
  }

  async function save() {
    if (!draft.model.trim()) {
      onError('Model is required');
      return;
    }
    setSaving(true);
    const payload = {
      customer_id: customerId,
      product_id: draft.productId || null,
      brand: draft.brand.trim() || null,
      model: draft.model.trim(),
      grip_size: draft.gripSize || null,
      barcode: draft.barcode.trim() || null,
      notes: draft.notes.trim() || null,
    };
    const { error: err } = existing
      ? await supabase.from('customer_rackets').update(payload).eq('id', existing.id)
      : await supabase.from('customer_rackets').insert(payload);
    setSaving(false);
    if (err) {
      onError(
        errorMessage(err).includes('duplicate') || errorMessage(err).includes('uq_customer_rackets_barcode')
          ? 'That barcode is already assigned to another racket.'
          : errorMessage(err),
      );
      return;
    }
    await onSaved();
  }

  return (
    <div className="space-y-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
      <p className="text-xs font-medium text-slate-500">{existing ? 'Edit racket' : 'Add racket'}</p>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">From catalog (optional)</span>
        <select value={draft.productId} onChange={(e) => pickCatalog(e.target.value)} className={inputClass}>
          <option value="">Not from catalog / enter manually</option>
          {catalogRackets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.brand ? `${p.brand} ` : ''}
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <label className="block flex-1 space-y-1">
          <span className="text-xs font-medium text-slate-500">Brand</span>
          <input value={draft.brand} onChange={(e) => patch({ brand: e.target.value })} className={inputClass} />
        </label>
        <label className="block flex-1 space-y-1">
          <span className="text-xs font-medium text-slate-500">Model *</span>
          <input value={draft.model} onChange={(e) => patch({ model: e.target.value })} className={inputClass} />
        </label>
      </div>

      <div className="flex gap-2">
        <label className="block flex-1 space-y-1">
          <span className="text-xs font-medium text-slate-500">Grip size</span>
          <select value={draft.gripSize} onChange={(e) => patch({ gripSize: e.target.value })} className={inputClass}>
            <option value="">—</option>
            {GRIP_SIZES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="block flex-1 space-y-1">
          <span className="text-xs font-medium text-slate-500">Barcode</span>
          <input
            value={draft.barcode}
            onChange={(e) => patch({ barcode: e.target.value })}
            placeholder="Scan or type the barcode"
            className={inputClass}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Notes</span>
        <textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} rows={2} className={inputClass} />
      </label>

      <div className="flex gap-2">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : existing ? 'Save changes' : 'Add racket'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}
