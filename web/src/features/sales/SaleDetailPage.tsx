import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { JsonValue, SaleLineKind } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { Spinner } from '../../components/Spinner';
import { useBack } from '../../app/BackContext';
import { staffLabel, type StaffRef } from '../../lib/staff';
import { hasReturnable, returnedItemsLabel } from './returnable';
import { priceChangeNote } from '../../lib/priceOverride';
import { savedDiscountCents, savedDiscountNote, savedTicketDiscountNote } from '../../lib/discounts';
import { paymentLabel } from '../../lib/paymentMethods';
import { saleLineLabel } from '../../lib/saleLines';
import { fromCents } from '../../lib/saleMath';

/** Passed by the register when a sale went through but delivering its racquet failed. */
export interface SaleDeliveryWarning {
  jobId: string;
  message: string;
}


interface SaleLineRaw {
  id: string;
  product_id: string | null;
  product_unit_id: string | null;
  qty: number;
  unit_price: number;
  list_price: number | null;
  price_reason: string | null;
  price_before_discount: number | null;
  line_discount: number | null;
  ticket_discount_each: number | null;
  discount_reason: string | null;
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
  ticket_discount: number | null;
  ticket_discount_reason: string | null;
  tax_exempt_id: string | null;
  discount_approver: StaffRef | null;
  sale_lines: SaleLineRaw[];
  sale_payments: Array<{ method: string; amount: number; check_number: string | null }>;
  refunds: Array<{
    id: string;
    subtotal: number;
    tax: number;
    refunded_at: string;
    refunded_by: StaffRef | null;
    refund_lines: { sale_line_id: string; qty: number }[];
    refund_payments: { method: string; check_number: string | null }[];
  }>;
}

export function SaleDetailPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  // The register's "delivery failed" warning shows for the sale it was about,
  // once: it's taken out of the page's history so a reload doesn't repeat it (#10).
  const [deliveryNotice] = useState(() => {
    const warning = (location.state as { deliveryWarning?: SaleDeliveryWarning } | null)?.deliveryWarning;
    return warning ? { saleId, warning } : null;
  });
  const deliveryWarning = deliveryNotice && deliveryNotice.saleId === saleId ? deliveryNotice.warning : undefined;
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);
  useBack('/sales');
  const startRequest = useLatestRequest();

  useEffect(() => {
    if (!saleId) return;
    // Moving to another sale, an answer for the previous one is ignored (#37),
    // and the previous sale's details and error are cleared straight away (#10).
    const isLatest = startRequest();
    setSale(null);
    setError(null);
    void (async () => {
      const { data, error: err } = await supabase
        .from('sales')
        .select(
          [
            'id, sold_at, subtotal, tax, payment_method, ticket_discount, ticket_discount_reason, tax_exempt_id',
            'customers ( first_name, last_name )',
            'rung_by:profiles!sales_user_id_fkey ( email )',
            'discount_approver:profiles!sales_discount_approved_by_fkey ( email )',
            'sale_lines ( id, product_id, product_unit_id, qty, unit_price, list_price, price_reason, price_before_discount, line_discount, ticket_discount_each, discount_reason, kind, products ( brand, name, attributes ), gift_cards ( code ) )',
            'sale_payments ( method, amount, check_number )',
            'refunds ( id, subtotal, tax, refunded_at, refunded_by:profiles!refunds_user_id_fkey ( email ), refund_lines ( sale_line_id, qty ), refund_payments ( method, check_number ) )',
          ].join(', '),
        )
        .eq('id', saleId)
        .single();
      if (!isLatest()) return;
      if (err) setError(errorMessage(err));
      else setSale(data as unknown as SaleDetail);
    })();
  }, [saleId, startRequest]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!sale) return <Spinner label="Loading…" />;

  const refundedTotal = sale.refunds.reduce((s, r) => s + Number(r.subtotal) + Number(r.tax), 0);
  const discountCents = savedDiscountCents(sale.sale_lines);
  const canRefund = hasReturnable(sale.sale_lines, sale.refunds.flatMap((r) => r.refund_lines));

  return (
    <div className="max-w-2xl space-y-5">
      {deliveryWarning && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Paid, but the racquet wasn't marked delivered: {deliveryWarning.message}{' '}
          <Link to={`/string-jobs/${deliveryWarning.jobId}`} className="font-medium text-blue-700 hover:underline">
            Mark it delivered from the string job
          </Link>
          .
        </div>
      )}
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
          <Link
            to={`/sales/${sale.id}/receipt`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Print receipt
          </Link>
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
                <p className="font-medium text-slate-900">{saleLineLabel(line)}</p>
                <p className="text-xs text-slate-500">
                  {line.qty} × ${Number(line.unit_price).toFixed(2)}
                </p>
                {priceChangeNote(line.list_price, line.price_before_discount ?? line.unit_price, line.price_reason) && (
                  <p className="text-xs text-amber-700">
                    {priceChangeNote(line.list_price, line.price_before_discount ?? line.unit_price, line.price_reason)}
                  </p>
                )}
                {savedDiscountNote(line) && <p className="text-xs text-green-700">{savedDiscountNote(line)}</p>}
              </div>
              <span className="font-semibold text-slate-900">
                ${(line.qty * Number(line.unit_price)).toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-slate-200 p-4">
          {discountCents > 0 && (
            <div className="flex justify-between text-sm text-slate-600">
              <span>
                Discounts
                {savedTicketDiscountNote(sale.ticket_discount, sale.ticket_discount_reason) &&
                  ` (ticket: ${savedTicketDiscountNote(sale.ticket_discount, sale.ticket_discount_reason)})`}
              </span>
              <span className="font-medium text-green-700">−${fromCents(discountCents).toFixed(2)}</span>
            </div>
          )}
          {staffLabel(sale.discount_approver) && (
            <p className="text-xs text-slate-500">
              Discount over the staff limit approved by {staffLabel(sale.discount_approver)}
            </p>
          )}
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
          {sale.tax_exempt_id && (
            <div className="flex justify-between text-sm text-slate-600">
              <span>Tax exempt · {sale.tax_exempt_id}</span>
              <span className="font-medium text-slate-900">No tax</span>
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
                <span className="text-slate-600">{paymentLabel(p.method, p.check_number)}</span>
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
                  {` · ${returnedItemsLabel(r.refund_lines)}`}
                  {r.refund_payments
                    .filter((p) => p.method === 'check')
                    .map((p) => ` · ${paymentLabel(p.method, p.check_number)}`)
                    .join('')}
                </span>
                {Number(r.subtotal) + Number(r.tax) > 0 ? (
                  <span className="font-medium text-red-600">
                    −${(Number(r.subtotal) + Number(r.tax)).toFixed(2)}
                  </span>
                ) : (
                  <span className="text-slate-500">nothing refunded</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
