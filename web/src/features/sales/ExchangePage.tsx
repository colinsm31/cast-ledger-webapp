import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { useBack } from '../../app/BackContext';
import { useSettings } from '../../lib/settings';
import { refundMethodsFor, saleMethodsFor, toPaymentPayload } from '../../lib/paymentMethods';
import { fetchSaleQuote, toSaleLinePayload, type SaleLineInput, type SaleQuote } from '../../lib/saleQuote';
import { paymentTypeChanges, refundSource } from '../../lib/saleMath';
import type { ScannedProduct } from '../scan/resolveBarcode';
import { ProductFinder } from './ProductFinder';
import { PaymentScreen, type Tender } from './PaymentScreen';
import { FrameReturnFields } from './FrameReturnFields';
import {
  DEFAULT_FRAME_RETURN,
  frameReturnLine,
  frameReturnProblem,
  hasItemsToReturn,
  isUnitLine,
  returnableQty,
  type FrameReturn,
} from './returnable';
import {
  exchangeDifference,
  lineLabel,
  loadSaleForReturn,
  refundedLinesOf,
  refundTotals,
  saleCustomerInactive,
  saleRefundable,
  type SaleData,
} from './saleForReturn';

// MARK: - Constants

const ExchangeConstants = {
  // A difference under half a cent is no difference.
  evenTolerance: 0.005,
};

// An exchange makes a new sale for the customer, which an inactive customer
// can't be on (0076).
const INACTIVE_CUSTOMER_MESSAGE =
  'This customer is inactive, so they can’t exchange: make them active again on their page first, or refund the items.';

const stepperClass = 'h-7 w-7 rounded border border-slate-300 hover:bg-slate-50';

interface NewLine {
  key: string;
  product: ScannedProduct;
  qty: number;
}

// MARK: - Page

/**
 * Return items from a sale and sell new ones on one ticket (record_exchange,
 * 0077). The returned items' value pays toward the new ones; the customer
 * pays any difference, or is given it back.
 */
export function ExchangePage() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  useBack(`/sales/${saleId}`);
  const { settings } = useSettings();

  const [sale, setSale] = useState<SaleData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [frameReturns, setFrameReturns] = useState<Record<string, FrameReturn>>({});
  const [newLines, setNewLines] = useState<NewLine[]>([]);
  const [quote, setQuote] = useState<SaleQuote | null>(null);
  // The price check failed: offer to try it again (bumping the attempt reruns it).
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'choose' | 'settle'>('choose');
  const [giveBackTenders, setGiveBackTenders] = useState<Tender[]>([]);
  const [methodChangeReason, setMethodChangeReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MARK: - Loading

  useEffect(() => {
    if (!saleId) return;
    loadSaleForReturn(saleId).then(setSale, (err) => setLoadError(errorMessage(err)));
  }, [saleId]);

  const remaining = useMemo(() => (sale ? returnableQty(sale.sale_lines, refundedLinesOf(sale)) : {}), [sale]);
  // Products and frames are exchanged; stringing and gift card loads are refunded instead.
  const returnableLines = (sale?.sale_lines ?? []).filter((l) => l.product_id && (remaining[l.id] ?? 0) > 0);

  const saleLines: SaleLineInput[] = useMemo(
    () => newLines.map((l) => ({ productId: l.product.id, qty: l.qty, price: Number(l.product.sell_price ?? 0) })),
    [newLines],
  );

  // The server's total for the new items, asked again whenever they change.
  // The old total is cleared first, so Continue waits for the new one and a
  // failed check leaves no total to settle against.
  useEffect(() => {
    setQuote(null);
    setQuoteFailed(false);
    if (saleLines.length === 0) return;
    let active = true;
    fetchSaleQuote(saleLines, sale?.customer_id ?? null).then(
      (fresh) => active && setQuote(fresh),
      (err) => {
        if (!active) return;
        setQuoteFailed(true);
        setError(errorMessage(err));
      },
    );
    return () => {
      active = false;
    };
  }, [saleLines, sale?.customer_id, quoteAttempt]);

  function checkPricesAgain() {
    setError(null);
    setQuoteAttempt((attempt) => attempt + 1);
  }

  // MARK: - Totals

  const credit = refundTotals(sale, returnQty).total;
  const newTotal = quote?.total ?? 0;
  const difference = exchangeDifference(newTotal, credit);
  // New items chosen, their total not back yet: no difference to show or settle.
  const totalPending = newLines.length > 0 && !quote;

  // The same limits as a refund's (an exchange's credit counts as the
  // original sale's payment types, 0081).
  const refundable = useMemo(() => saleRefundable(sale), [sale]);
  const changedTypes = paymentTypeChanges(
    refundable,
    giveBackTenders.map((t) => ({ method: refundSource(t.method, t.giftCardId), amount: t.amount })),
  );

  // Store credit goes to the sale's customer, so it's offered only when there is one.
  const giveBackMethods = refundMethodsFor(
    settings?.accept_checks ?? false,
    (sale?.sale_payments ?? []).some((p) => p.method === 'check'),
  ).filter((method) => method !== 'store_credit' || Boolean(sale?.customer_id));

  // MARK: - Actions

  function setReturn(lineId: string, qty: number) {
    const v = Math.max(0, Math.min(qty, remaining[lineId] ?? 0));
    setReturnQty((prev) => ({ ...prev, [lineId]: v }));
  }

  function addProduct(product: ScannedProduct) {
    if (product.is_serialized) {
      setError('Sell a racquet frame from the register, where its barcode is scanned.');
      return;
    }
    setError(null);
    setNewLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) return prev.map((l) => (l === existing ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { key: crypto.randomUUID(), product, qty: 1 }];
    });
  }

  function setNewQty(key: string, qty: number) {
    setNewLines((prev) => prev.flatMap((l) => (l.key !== key ? [l] : qty > 0 ? [{ ...l, qty }] : [])));
  }

  /** What's wrong with the ticket as it stands, or null. */
  function ticketProblem(): string | null {
    if (!sale) return 'The sale is still loading.';
    if (saleCustomerInactive(sale)) return INACTIVE_CUSTOMER_MESSAGE;
    if (!hasItemsToReturn(returnQty)) return 'Choose what the customer is bringing back.';
    if (newLines.length === 0) return 'Add what the customer is taking instead.';
    if (!quote) return 'Working out the new items’ total…';
    if (quote.problems.length > 0) return quote.problems.map((p) => p.message).join(' ');
    const frameProblem = sale.sale_lines
      .filter((l) => isUnitLine(l) && (returnQty[l.id] ?? 0) > 0)
      .map((l) => frameReturnProblem(frameReturns[l.id] ?? DEFAULT_FRAME_RETURN))
      .find(Boolean);
    return frameProblem ?? null;
  }

  function continueToSettle() {
    const problem = ticketProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (Math.abs(difference) < ExchangeConstants.evenTolerance) {
      void submit([], []);
      return;
    }
    setStep('settle');
  }

  async function submit(payments: Tender[], refundPayments: Tender[]) {
    if (!sale) return;
    setSaving(true);
    setError(null);
    const returnLines = sale.sale_lines
      .filter((l) => (returnQty[l.id] ?? 0) > 0)
      .map((l) =>
        isUnitLine(l)
          ? frameReturnLine(l.id, frameReturns[l.id] ?? DEFAULT_FRAME_RETURN)
          : { sale_line_id: l.id, qty: returnQty[l.id] },
      );
    const { data, error: err } = await supabase.rpc('record_exchange', {
      p_sale_id: sale.id,
      p_return_lines: returnLines,
      p_new_lines: saleLines.map(toSaleLinePayload),
      p_customer_id: sale.customer_id,
      p_payments: payments.map(toPaymentPayload),
      p_refund_payments: refundPayments.map(toPaymentPayload),
      p_reason: reason.trim() || null,
      p_method_change_reason: changedTypes.length > 0 ? methodChangeReason.trim() : null,
    });
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    navigate(`/sales/${(data as { sale_id: string }).sale_id}`);
  }

  // MARK: - Render

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!sale) return <Spinner label="Loading…" />;

  if (step === 'settle' && difference > 0) {
    return (
      <PaymentScreen
        total={difference}
        customerId={sale.customer_id}
        busy={saving}
        error={error}
        methods={saleMethodsFor(settings?.accept_checks ?? false)}
        title="Exchange: customer owes"
        backLabel="Back to the exchange"
        completeLabel="Complete exchange"
        onBack={() => setStep('choose')}
        onComplete={(tenders) => void submit(tenders, [])}
      >
        <ExchangeSummary credit={credit} newTotal={newTotal} />
      </PaymentScreen>
    );
  }

  if (step === 'settle') {
    return (
      <PaymentScreen
        total={-difference}
        customerId={sale.customer_id}
        busy={saving}
        error={error}
        giveBack
        methods={giveBackMethods}
        title="Exchange: customer is owed"
        backLabel="Back to the exchange"
        completeLabel="Give back & complete exchange"
        completeDisabled={changedTypes.length > 0 && !methodChangeReason.trim()}
        onTendersChange={setGiveBackTenders}
        onBack={() => setStep('choose')}
        onComplete={(tenders) => void submit([], tenders)}
      >
        <ExchangeSummary credit={credit} newTotal={newTotal} />
        {changedTypes.length > 0 && (
          <label className="block space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <span className="text-sm text-amber-900">
              Giving back more to a payment type than the sale took that way. Give a reason:
            </span>
            <input
              value={methodChangeReason}
              onChange={(e) => setMethodChangeReason(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        )}
      </PaymentScreen>
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Exchange</h1>
        <p className="text-sm text-slate-500">
          {sale.customers ? customerNameLastFirst(sale.customers) : 'Unidentified Customer'}
        </p>
      </div>

      {saleCustomerInactive(sale) && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {INACTIVE_CUSTOMER_MESSAGE}
        </p>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <h2 className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">Bringing back</h2>
        {returnableLines.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Nothing on this sale can be exchanged.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {returnableLines.map((l) => (
              <li key={l.id} className="p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{lineLabel(l.products)}</p>
                    <p className="text-xs text-slate-500">
                      ${Number(l.unit_price).toFixed(2)} each · {remaining[l.id]} can come back
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setReturn(l.id, (returnQty[l.id] ?? 0) - 1)} className={stepperClass}>−</button>
                    <span className="w-8 text-center text-sm font-medium">{returnQty[l.id] ?? 0}</span>
                    <button onClick={() => setReturn(l.id, (returnQty[l.id] ?? 0) + 1)} className={stepperClass}>+</button>
                  </div>
                </div>
                {isUnitLine(l) && (returnQty[l.id] ?? 0) > 0 && (
                  <FrameReturnFields
                    frame={frameReturns[l.id] ?? DEFAULT_FRAME_RETURN}
                    problem={frameReturnProblem(frameReturns[l.id] ?? DEFAULT_FRAME_RETURN)}
                    onChange={(frame) => setFrameReturns((prev) => ({ ...prev, [l.id]: frame }))}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
        <h2 className="text-sm font-semibold text-slate-700">Taking instead</h2>
        <ProductFinder open onPick={addProduct} productLabel={lineLabel} />
        {newLines.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {newLines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{lineLabel(l.product)}</p>
                  <p className="text-xs text-slate-500">${Number(l.product.sell_price ?? 0).toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setNewQty(l.key, l.qty - 1)} className={stepperClass}>−</button>
                  <span className="w-8 text-center text-sm font-medium">{l.qty}</span>
                  <button onClick={() => setNewQty(l.key, l.qty + 1)} className={stepperClass}>+</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ExchangeSummary credit={credit} newTotal={totalPending ? null : newTotal} />

      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional), e.g. wrong size"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={totalPending && quoteFailed ? checkPricesAgain : continueToSettle}
        disabled={saving || (totalPending && !quoteFailed)}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving
          ? 'Saving…'
          : totalPending && quoteFailed
            ? 'Check prices again'
            : totalPending
            ? 'Working out the new items’ total…'
            : difference > ExchangeConstants.evenTolerance
            ? `Collect $${difference.toFixed(2)}`
            : difference < -ExchangeConstants.evenTolerance
              ? `Give back $${(-difference).toFixed(2)}`
              : 'Complete exchange'}
      </button>
    </div>
  );
}

// MARK: - Summary

/** The return's credit against the new items; newTotal is null while it's being worked out. */
function ExchangeSummary({ credit, newTotal }: { credit: number; newTotal: number | null }) {
  const difference = exchangeDifference(newTotal ?? 0, credit);
  return (
    <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="flex justify-between">
        <span className="text-slate-600">Coming back (with tax)</span>
        <span className="font-medium">−${credit.toFixed(2)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-600">New items (with tax)</span>
        <span className="font-medium">{newTotal === null ? '…' : `$${newTotal.toFixed(2)}`}</span>
      </div>
      <div className="flex justify-between border-t border-slate-100 pt-1">
        <span className="font-semibold text-slate-700">
          {newTotal === null
            ? 'Working out the difference'
            : difference > 0
              ? 'Customer pays'
              : difference < 0
                ? 'Customer gets back'
                : 'Even swap'}
        </span>
        <span className="text-lg font-bold text-slate-900">
          {newTotal === null ? '…' : `$${Math.abs(difference).toFixed(2)}`}
        </span>
      </div>
    </section>
  );
}
