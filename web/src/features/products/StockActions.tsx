import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';

// Per-variant stock actions: Receive (positive) or Adjust (signed) via the RPCs.
// Shared by the product detail and variant detail pages.
export function StockActions({
  variantId,
  onDone,
  onError,
}: {
  variantId: string;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [mode, setMode] = useState<'none' | 'receive' | 'adjust'>('none');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setMode('none');
    setQty('');
    setNote('');
  }

  async function submit() {
    const n = Number(qty);
    if (!qty || Number.isNaN(n) || n === 0) {
      onError('Enter a non-zero quantity');
      return;
    }
    if (mode === 'receive' && n < 0) {
      onError('Receive quantity must be positive');
      return;
    }
    setBusy(true);
    const { error: err } =
      mode === 'receive'
        ? await supabase.rpc('receive_stock', {
            p_variant_id: variantId,
            p_qty: n,
            p_unit_cost: null,
            p_location: null,
            p_note: note.trim() || null,
          })
        : await supabase.rpc('adjust_stock', {
            p_variant_id: variantId,
            p_qty: n,
            p_note: note.trim() || null,
          });
    setBusy(false);
    if (err) {
      onError(errorMessage(err));
      return;
    }
    reset();
    await onDone();
  }

  if (mode === 'none') {
    return (
      <div className="flex gap-2">
        <button
          onClick={() => setMode('receive')}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Receive
        </button>
        <button
          onClick={() => setMode('adjust')}
          className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Adjust
        </button>
      </div>
    );
  }

  const smallInput =
    'rounded-lg border border-slate-300 px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2">
      <span className="text-xs font-medium text-slate-500">
        {mode === 'receive' ? 'Receive' : 'Adjust (+/−)'}
      </span>
      <input
        autoFocus
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Qty"
        inputMode="numeric"
        className={`${smallInput} w-20`}
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className={`${smallInput} flex-1 min-w-[8rem]`}
      />
      <button
        onClick={() => void submit()}
        disabled={busy}
        className="rounded-lg bg-blue-600 px-3 py-1 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? '…' : 'Save'}
      </button>
      <button onClick={reset} className="text-xs text-slate-500 hover:underline">
        Cancel
      </button>
    </div>
  );
}
