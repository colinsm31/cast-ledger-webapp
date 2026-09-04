import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import type { ProductUnit, ProductUnitStatus } from '../../types/domain';
import { sellUnitPath } from '../scan/scanFlow';
import { ReceiveUnitsSheet } from './ReceiveUnitsSheet';

// MARK: - Status styling

const STATUS_STYLE: Record<ProductUnitStatus, string> = {
  in_stock: 'bg-green-100 text-green-800',
  sold: 'bg-slate-100 text-slate-600',
  demo: 'bg-amber-100 text-amber-800',
  assigned: 'bg-blue-100 text-blue-800',
  retired: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<ProductUnitStatus, string> = {
  in_stock: 'in stock',
  sold: 'sold',
  demo: 'demo',
  assigned: 'assigned',
  retired: 'retired',
};

// MARK: - UnitsSection
//
// The individual physical units under a serialized product (rackets). Lists each
// unit with its personal barcode and status, and opens the receive sheet to add
// more. Replaces the quantity-based stock controls for serialized products.
export function UnitsSection({
  productId,
  productLabel,
  autoReceive = false,
}: {
  productId: string;
  productLabel: string;
  autoReceive?: boolean;
}) {
  const [units, setUnits] = useState<ProductUnit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(autoReceive);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('product_units')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: true });
    if (err) setError(errorMessage(err));
    else setUnits((data ?? []) as ProductUnit[]);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const inStock = units?.filter((u) => u.status === 'in_stock').length ?? 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Units</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm">
            <span className="font-semibold">{inStock}</span>{' '}
            <span className="text-slate-400">in stock</span>
          </span>
          <button
            onClick={() => setReceiving(true)}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Receive rackets
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {units && units.length === 0 && (
        <p className="text-sm text-slate-500">
          No units yet. Use “Receive rackets” to scan each racket in.
        </p>
      )}

      {units && units.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {units.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className={u.barcode ? 'font-mono text-slate-900' : 'italic text-slate-400'}>
                {u.barcode ?? 'No barcode'}
              </span>
              <div className="flex items-center gap-3">
                {u.status === 'in_stock' && (
                  <Link to={sellUnitPath(u.id)} className="text-xs font-medium text-blue-600 hover:underline">
                    Sell
                  </Link>
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[u.status]}`}
                >
                  {STATUS_LABEL[u.status]}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {receiving && (
        <ReceiveUnitsSheet
          productId={productId}
          productLabel={productLabel}
          onDone={load}
          onClose={() => setReceiving(false)}
        />
      )}
    </section>
  );
}
