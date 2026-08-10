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

interface SaleLineRaw {
  qty: number;
  unit_price: number;
  products: { brand: string | null; name: string; attributes: Record<string, JsonValue> | null } | null;
  gift_cards: { code: string } | null;
}

interface SaleDetail {
  id: string;
  sold_at: string;
  subtotal: number;
  tax: number;
  payment_method: string | null;
  customers: { first_name: string; last_name: string } | null;
  sale_lines: SaleLineRaw[];
  sale_payments: Array<{ method: string; amount: number }>;
}

function lineLabel(line: SaleLineRaw): string {
  if (line.products) {
    const attrs = Object.values(line.products.attributes ?? {})
      .filter((v) => v != null && v !== '')
      .map(String);
    return [line.products.brand, line.products.name, ...attrs].filter(Boolean).join(' ');
  }
  if (line.gift_cards) return `Gift card ${line.gift_cards.code}`;
  return 'Stringing'; // string-job service line
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
          'id, sold_at, subtotal, tax, payment_method, customers ( first_name, last_name ), sale_lines ( qty, unit_price, products ( brand, name, attributes ), gift_cards ( code ) ), sale_payments ( method, amount )',
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
                <p className="font-medium text-slate-900">{lineLabel(line)}</p>
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
        <div className="space-y-1 border-t border-slate-200 p-4">
          <div className="flex justify-between text-sm text-slate-600">
            <span>Subtotal</span>
            <span className="font-medium text-slate-900">${Number(sale.subtotal).toFixed(2)}</span>
          </div>
          {Number(sale.tax) > 0 && (
            <div className="flex justify-between text-sm text-slate-600">
              <span>Tax</span>
              <span className="font-medium text-slate-900">${Number(sale.tax).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-100 pt-1">
            <span className="text-sm font-semibold text-slate-700">Total</span>
            <span className="text-xl font-bold text-slate-900">
              ${(Number(sale.subtotal) + Number(sale.tax)).toFixed(2)}
            </span>
          </div>
        </div>
      </section>

      {/* Payment breakdown */}
      {sale.sale_payments.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Payment</h2>
          <ul className="space-y-1">
            {sale.sale_payments.map((p, i) => (
              <li key={i} className="flex justify-between text-sm">
                <span className="text-slate-600">{PAYMENT_LABEL[p.method] ?? p.method}</span>
                <span className="font-medium text-slate-900">${Number(p.amount).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
