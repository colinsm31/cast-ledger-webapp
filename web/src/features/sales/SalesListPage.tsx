import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { customerNameLastFirst } from '../../types/domain';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

interface SaleRow {
  id: string;
  sold_at: string;
  subtotal: number;
  customers: { first_name: string; last_name: string } | null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function SalesListPage() {
  const navigate = useNavigate();
  const [sales, setSales] = useState<SaleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('sales')
        .select('id, sold_at, subtotal, customers ( first_name, last_name )')
        .order('sold_at', { ascending: false })
        .limit(100);
      if (err) setError(errorMessage(err));
      else setSales((data ?? []) as unknown as SaleRow[]);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Sales</h1>
        <Link
          to="/sales/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New sale
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {sales === null && !error && <Spinner label="Loading…" />}
      {sales && sales.length === 0 && (
        <EmptyState title="No sales yet" message="Completed sales will appear here." />
      )}
      {sales && sales.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {sales.map((sale) => (
            <li key={sale.id}>
              <button
                onClick={() => navigate(`/sales/${sale.id}`)}
                className="flex w-full items-center justify-between p-4 text-left hover:bg-slate-50"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {sale.customers ? customerNameLastFirst(sale.customers) : 'Unidentified Customer'}
                  </p>
                  <p className="text-xs text-slate-500">{formatDateTime(sale.sold_at)}</p>
                </div>
                <span className="font-semibold text-slate-900">${Number(sale.subtotal).toFixed(2)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
