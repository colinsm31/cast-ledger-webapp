import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { JsonValue, SaleLineKind } from '../../types/domain';
import { customerNameLastFirst, stringingLineName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { useBack } from '../../app/BackContext';
import { staffLabel, type StaffRef } from '../../lib/staff';

const PAYMENT_LABEL: Record<string, string> = {
  credit: 'Credit',
  cash: 'Cash',
  gift_card: 'Gift Card',
  store_credit: 'Store Credit',
};

interface SaleLineRaw {
  qty: number;
  unit_price: number;
  kind: SaleLineKind;
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
  rung_by: StaffRef | null;
  sale_lines: SaleLineRaw[];
  sale_payments: Array<{ method: string; amount: number }>;
  refunds: Array<{
    id: string;
    subtotal: number;
    tax: number;
    refunded_at: string;
    refunded_by: StaffRef | null;
    refund_lines: { qty: number }[];
  }>;
}

function lineLabel(line: SaleLineRaw): string {
  if (line.products) {
    const attrs = Object.values(line.products.attributes ?? {})
      .filter((v) => v != null && v !== '')
      .map(String);
    return [line.products.brand, line.products.name, ...attrs].filter(Boolean).join(' ');
  }
  if (line.gift_cards) return `Gift card ${line.gift_cards.code}`;
  return stringingLineName(line.kind); // string-job service line
}

export function SaleDetailPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useBack('/sales');

  useEffect(() => {
    if (!saleId) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from('sales')
        .select(
          [
            'id, sold_at, subtotal, tax, payment_method',
            'customers ( first_name, last_name )',
            'rung_by:profiles!sales_user_id_fkey ( email )',
            'sale_lines ( qty, unit_price, kind, products ( brand, name, attributes ), gift_cards ( code ) )',
            'sale_payments ( method, amount )',
            'refunds ( id, subtotal, tax, refunded_at, refunded_by:profiles!refunds_user_id_fkey ( email ), refund_lines ( qty ) )',
          ].join(', '),
        )
        .eq('id', saleId)
        .single();
      if (err) setError(errorMessage(err));
      else setSale(data as unknown as SaleDetail);
    })();
  }, [saleId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!sale) return <Spinner label="Loading…" />;

  const soldProductQty = sale.sale_lines.filter((l) => l.products).reduce((s, l) => s + l.qty, 0);
  const refundedQty = sale.refunds.reduce((s, r) => s + r.refund_lines.reduce((a, x) => a + x.qty, 0), 0);
  const refundedTotal = sale.refunds.reduce((s, r) => s + Number(r.subtotal) + Number(r.tax), 0);
  const canRefund = soldProductQty - refundedQty > 0;

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
          <p className="text-sm text-slate-500">
            {new Date(sale.sold_at).toLocaleString()}
            {staffLabel(sale.rung_by) && ` · Rung up by ${staffLabel(sale.rung_by)}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {canRefund && (
            <Link
              to={`/sales/${sale.id}/refund`}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Return / Refund
            </Link>
          )}
          <Link
            to="/sales/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            New sale
          </Link>
        </div>
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
          {refundedTotal > 0 && (
            <>
              <div className="flex justify-between text-sm text-red-600">
                <span>Refunded</span>
                <span className="font-medium">−${refundedTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-slate-700">
                <span>Net</span>
                <span>
                  ${(Number(sale.subtotal) + Number(sale.tax) - refundedTotal).toFixed(2)}
                </span>
              </div>
            </>
          )}
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

      {/* Refunds against this sale */}
      {sale.refunds.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Refunds</h2>
          <ul className="space-y-1">
            {sale.refunds.map((r) => (
              <li key={r.id} className="flex justify-between text-sm">
                <span className="text-slate-600">
                  {new Date(r.refunded_at).toLocaleString()}
                  {staffLabel(r.refunded_by) && ` · by ${staffLabel(r.refunded_by)}`}
                </span>
                <span className="font-medium text-red-600">
                  −${(Number(r.subtotal) + Number(r.tax)).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
