import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { resolveBarcode } from '../scan/resolveBarcode';
import { barcodeCanonical, barcodeInUseMessage } from './barcodeClash';

// MARK: - Types

interface PendingUnit {
  // The scanned personal barcode, or null for a unit received without one.
  barcode: string | null;
}

// MARK: - ReceiveUnitsSheet
//
// Receiving flow for a serialized product (rackets): the user scans one personal
// barcode per physical unit into the list, or adds a unit with no barcode (the
// barcode is optional and can be filled in later). Submitting creates the units
// via the receive_units RPC.
export function ReceiveUnitsSheet({
  productId,
  productLabel,
  onDone,
  onClose,
}: {
  productId: string;
  productLabel: string;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const [pending, setPending] = useState<PendingUnit[]>([]);
  const [scan, setScan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  async function addBarcode() {
    const code = scan.trim();
    if (!code) return;
    if (pending.some((u) => u.barcode && barcodeCanonical(u.barcode) === barcodeCanonical(code))) {
      setError(`Barcode ${code} is already in this list`);
      return;
    }
    // A code means one thing: say so now rather than when the list is submitted.
    try {
      const inUse = barcodeInUseMessage(await resolveBarcode(code));
      if (inUse) {
        setError(inUse);
        return;
      }
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    setError(null);
    setPending((prev) => [...prev, { barcode: code }]);
    setScan('');
    scanRef.current?.focus();
  }

  function addWithoutBarcode() {
    setError(null);
    setPending((prev) => [...prev, { barcode: null }]);
    scanRef.current?.focus();
  }

  function removeAt(index: number) {
    setPending((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (pending.length === 0) {
      setError('Scan a barcode or add a unit without one');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('receive_units', {
      p_product_id: productId,
      p_barcodes: pending.map((u) => u.barcode),
    });
    setBusy(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setPending([]);
    await onDone();
    onClose();
  }

  const withBarcode = pending.filter((u) => u.barcode !== null).length;
  const withoutBarcode = pending.length - withBarcode;

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/30 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Receive rackets</h2>
            <p className="text-sm text-slate-500">{productLabel}</p>
          </div>
          <button onClick={onClose} className="text-sm text-slate-400 hover:text-slate-600">
            Close
          </button>
        </div>

        <p className="mb-2 text-sm text-slate-600">
          Scan each racket’s barcode, or add one without a barcode. Barcodes are optional and can be added later.
        </p>

        <div className="flex gap-2">
          <input
            ref={scanRef}
            autoFocus
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void addBarcode();
              }
            }}
            placeholder="Scan or type a barcode"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => void addBarcode()}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Add
          </button>
        </div>
        <button
          onClick={addWithoutBarcode}
          className="mt-2 text-sm font-medium text-blue-600 hover:underline"
        >
          + Add a unit without a barcode
        </button>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        {pending.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {pending.map((u, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className={u.barcode ? 'font-mono text-slate-900' : 'italic text-slate-500'}>
                  {u.barcode ?? 'No barcode'}
                </span>
                <button
                  onClick={() => removeAt(i)}
                  className="text-xs font-medium text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            {pending.length} to receive
            {withoutBarcode > 0 && ` (${withBarcode} with, ${withoutBarcode} without)`}
          </span>
          <button
            onClick={() => void submit()}
            disabled={busy || pending.length === 0}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Receiving…' : `Receive ${pending.length || ''}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
