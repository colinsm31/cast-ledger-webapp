import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { JsonValue } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';

const PAYMENT_LABEL: Record<string, string> = {
  credit: 'Credit',
  cash: 'Cash',
  gift_card: 'Gift Card',
  store_credit: 'Store Credit',
};

interface SaleDetail {
  id: string;
  sold_at: string;
  subtotal: number;
  payment_method: string | null;
  customers: { first_name: string; last_name: string } | null;
  sale_lines: Array<{
    qty: number;
    unit_price: number;
    products: { brand: string | null; name: string; attributes: Record<string, JsonValue> | null } | null;
  }>;
}

function lineLabel(p: SaleDetail['sale_lines'][number]['products']): string {
  if (!p) return 'Stringing'; // service line (no product)
  const attrs = Object.values(p.attributes ?? {})
    .filter((v) => v != null && v !== '')
    .map(String);
  return [p.brand, p.name, ...attrs].filter(Boolean).join(' ');
}

export function SaleDetailPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!saleId) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from('sales')
        .select(
          'id, sold_at, subtotal, payment_method, customers ( first_name, last_name ), sale_lines ( qty, unit_price, products ( brand, name, attributes ) )',
        )
        .eq('id', saleId)
        .single();
      if (err) setError(errorMessage(err));
      else setSale(data as unknown as SaleDetail);
    })();
  }, [saleId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!sale) return <Spinner label="Loading…" />;

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/sales" className="text-sm text-blue-600 hover:underline">
            ‹ Sales
          </Link>
          <h1 className="text-xl font-bold text-slate-900">
            {sale.customers ? customerNameLastFirst(sale.customers) : 'Unidentified Customer'}
          </h1>
          <p className="text-sm text-slate-500">{new Date(sale.sold_at).toLocaleString()}</p>
        </div>
        <Link
          to="/sales/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New sale
        </Link>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white">
        <ul className="divide-y divide-slate-100">
          {sale.sale_lines.map((line, i) => (
            <li key={i} className="flex items-center justify-between p-3">
              <div>
                <p className="font-medium text-slate-900">{lineLabel(line.products)}</p>
                <p className="text-xs text-slate-500">
                  {line.qty} × ${Number(line.unit_price).toFixed(2)}
                </p>
              </div>
              <span className="font-semibold text-slate-900">
                ${(line.qty * Number(line.unit_price)).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-200 p-4">
          <div>
            <span className="text-sm font-medium text-slate-500">Subtotal</span>
            {sale.payment_method && (
              <p className="text-xs text-slate-500">
                Paid by {PAYMENT_LABEL[sale.payment_method] ?? sale.payment_method}
              </p>
            )}
          </div>
          <span className="text-xl font-bold text-slate-900">${Number(sale.subtotal).toFixed(2)}</span>
        </div>
      </section>
    </div>
  );
}
