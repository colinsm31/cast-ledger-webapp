import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { withRegisterDrawer } from '../../lib/drawers';
import { RegisterDrawerNotice } from '../drawer/RegisterDrawerNotice';
import { DayClosedNotice } from '../endofday/DayClosedNotice';
import type { PaymentMethod } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { useBack } from '../../app/BackContext';
import { hasSubCent, SUB_CENT_MESSAGE } from '../../lib/money';
import { useSettings, cashNeedsOpenDrawer } from '../../lib/settings';
import {
  PAYMENT_METHOD_LABEL as METHOD_LABEL,
  paymentLabel,
  refundMethodsFor,
  toPaymentPayload,
} from '../../lib/paymentMethods';
import { CheckEntry } from './CheckEntry';
import {
  DEFAULT_FRAME_RETURN,
  frameReturnLine,
  frameReturnProblem,
  hasItemsToReturn,
  giftCardLoadLineIds,
  giftCardLoadRefundCents,
  giftCardLoadUnused,
  isGiftCardLoadLine,
  isStringingLine,
  isUnitLine,
  refundPriceCents,
  returnableQty,
  stringingLineNote,
  waitsForJobCharge,
  type FrameReturn,
} from './returnable';
import { jobCode } from '../stringjobs/jobTag';
import { useAuth } from '../../auth/AuthContext';
import { AdminApprovalDialog } from '../../components/AdminApprovalDialog';
import { approveRefundAsAdmin, isApprovalRefusal, REFUND_APPROVAL_MINUTES } from '../../lib/discountApproval';
import { FrameReturnFields } from './FrameReturnFields';
import { GiftCardRefundEntry } from './GiftCardRefundEntry';
import {
  allocateToOriginalPayments,
  fromCents,
  paymentTypeChanges,
  refundSource,
  roundMoney,
  toCents,
} from '../../lib/saleMath';
import {
  canRefundTo,
  lineLabel,
  loadSaleForReturn,
  moneyPaymentsOf,
  refundedLinesOf,
  refundTotals,
  saleCustomerInactive,
  saleRefundable,
  type SaleData,
  type SaleLine,
} from './saleForReturn';

interface Tender {
  id: string;
  method: PaymentMethod;
  amount: number;
  giftCardId?: string;
  code?: string;
  checkNumber?: string;
}

const inputClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export function RefundPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  useBack(`/sales/${saleId}`);

  const [sale, setSale] = useState<SaleData | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  // What happens to each racquet frame being returned (0070).
  const [frameReturns, setFrameReturns] = useState<Record<string, FrameReturn>>({});
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [reason, setReason] = useState('');
  const [methodChangeReason, setMethodChangeReason] = useState('');
  const [mode, setMode] = useState<'none' | PaymentMethod>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Each loaded gift card's balance, and the admin's approval for refunding a load (0075).
  const [cardBalances, setCardBalances] = useState<Record<string, number>>({});
  const [askingApproval, setAskingApproval] = useState(false);
  // An approval kept after a failed refund, so a retry of the same loads
  // doesn't need the admin again (the failed refund didn't use it up).
  const [keptApproval, setKeptApproval] = useState<{ id: string; lines: string; expiresAt: number } | null>(null);
  const { settings } = useSettings();
  const { isAdmin } = useAuth();

  useEffect(() => {
    if (!saleId) return;
    void (async () => {
      let loaded: SaleData;
      try {
        loaded = await loadSaleForReturn(saleId);
      } catch (err) {
        setLoadError(errorMessage(err));
        return;
      }
      setSale(loaded);
      // What each loaded card holds now: only an unused load is refunded.
      const cardIds = loaded.sale_lines.map((l) => l.gift_card_id).filter((id): id is string => !!id);
      if (cardIds.length > 0) {
        const { data: balances, error: balanceErr } = await supabase
          .from('gift_card_balance')
          .select('gift_card_id, balance')
          .in('gift_card_id', cardIds);
        if (balanceErr) setLoadError(errorMessage(balanceErr));
        else setCardBalances(Object.fromEntries((balances ?? []).map((b) => [b.gift_card_id as string, Number(b.balance)])));
      }
    })();
  }, [saleId]);

  const refundedLines = useMemo(() => refundedLinesOf(sale), [sale]);

  // Remaining returnable qty per product line, racquet frame and stringing
  // charge (original minus already refunded).
  const remaining = useMemo(() => (sale ? returnableQty(sale.sale_lines, refundedLines) : {}), [sale, refundedLines]);

  function refundTotalsFor(qty: Record<string, number>) {
    return refundTotals(sale, qty);
  }

  // A job strung and waiting for pickup is delivered before its charge is
  // refunded; a string change's charge waits for the job's own (0079).
  function waitingForPickup(line: SaleLine): boolean {
    return line.string_jobs?.status === 'complete' || waitsForJobCharge(line);
  }

  const { subtotal, tax, total } = useMemo(
    () => refundTotalsFor(returnQty),
    // refundTotalsFor only reads `sale`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sale, returnQty],
  );
  const allocated = roundMoney(tenders.reduce((s, t) => s + t.amount, 0));
  const remainingToAllocate = roundMoney(total - allocated);
  const itemsChosen = hasItemsToReturn(returnQty);
  // A $0 refund (free items) returns stock with no money back, so it has no
  // refund payments to place.
  const showRefundTenders = total > 0 || tenders.length > 0;

  // What each payment type the sale used can still give back (a gift card
  // only to the card that paid), and which this refund over-sends to (a
  // payment-type change; a reason is optional, 0093). An exchange's credit (0077)
  // counts as the original sale's payment types (0081).
  const refundable = useMemo(() => saleRefundable(sale), [sale]);
  // What Void suggests: the payments money can go back to (an exchange's
  // credit as the types it came from, 0082), less any gift card made
  // inactive since (it can't take money back, 0076).
  // Store credit can't go to a customer made inactive since (0076) either.
  const suggestedPayments = useMemo(
    () =>
      moneyPaymentsOf(sale)
        .filter(canRefundTo)
        .filter((p) => p.method !== 'store_credit' || !saleCustomerInactive(sale)),
    [sale],
  );
  const changedTypes = paymentTypeChanges(
    refundable,
    tenders.map((t) => ({ method: refundSource(t.method, t.giftCardId), amount: t.amount })),
  );
  // "Cash", or "Gift Card GC-123" for a card.
  const cardCodes = useMemo(() => {
    const codes = new Map<string, string>();
    for (const p of moneyPaymentsOf(sale)) if (p.gift_card_id && p.gift_cards) codes.set(p.gift_card_id, p.gift_cards.code);
    for (const t of tenders) if (t.giftCardId && t.code) codes.set(t.giftCardId, t.code);
    return codes;
  }, [sale, tenders]);
  function sourceLabel(source: string): string {
    const [method, cardId] = source.split(':') as [PaymentMethod, string | undefined];
    return cardId ? `${METHOD_LABEL[method]} ${cardCodes.get(cardId) ?? ''}`.trim() : paymentLabel(method);
  }
  const needsMethodChangeReason = changedTypes.length > 0;

  function setQty(lineId: string, qty: number) {
    const max = remaining[lineId] ?? 0;
    const v = Math.max(0, Math.min(qty, max));
    setReturnQty((prev) => ({ ...prev, [lineId]: v }));
  }

  function voidSale() {
    if (!sale) return;
    // Return everything still returnable, and prefill the original tenders.
    const q: Record<string, number> = {};
    for (const line of sale.sale_lines) {
      const usedLoad = isGiftCardLoadLine(line) && !giftCardLoadUnused(line, cardBalances[line.gift_card_id ?? '']);
      if ((remaining[line.id] ?? 0) > 0 && !waitingForPickup(line) && !usedLoad) q[line.id] = remaining[line.id];
    }
    setReturnQty(q);
    // Send the money back the way it came, up to what each payment type can
    // still give back; anything left over is for the cashier to place.
    const { allocations } = allocateToOriginalPayments(
      toCents(refundTotalsFor(q).total),
      suggestedPayments,
      refundable,
      (p) => refundSource(p.method, p.gift_card_id),
    );
    // A refund check needs its own number, so check payments are left for the
    // cashier to add with Check.
    setTenders(
      allocations.filter(({ payment }) => payment.method !== 'check').map(({ payment, cents }) => ({
        id: crypto.randomUUID(),
        method: payment.method,
        amount: fromCents(cents),
        giftCardId: payment.gift_card_id ?? undefined,
        code: payment.gift_cards?.code,
      })),
    );
    setReason((r) => r || 'Void');
  }

  function addTender(t: Omit<Tender, 'id'>) {
    setTenders((prev) => [...prev, { ...t, id: crypto.randomUUID() }]);
    setMode('none');
  }

  // A gift card load comes back only with an admin's approval (0075), unless
  // an admin is the one signed in.
  const loadCents = giftCardLoadRefundCents(sale?.sale_lines ?? [], returnQty);
  const loadLineIds = giftCardLoadLineIds(sale?.sale_lines ?? [], returnQty);
  const refundsLoad = loadCents > 0;

  /** The kept approval, while it still covers these loads and hasn't expired. */
  function usableKeptApproval(): string | null {
    if (!keptApproval || keptApproval.lines !== loadLineIds.join(',') || Date.now() >= keptApproval.expiresAt) return null;
    return keptApproval.id;
  }

  async function process(givenApprovalId: string | null = null) {
    const approvalId = givenApprovalId ?? (refundsLoad ? usableKeptApproval() : null);
    if (!itemsChosen) {
      setError('Choose at least one item to return.');
      return;
    }
    if (Math.abs(remainingToAllocate) > 0.005) {
      setError('Refund tender must equal the refund total.');
      return;
    }
    const frameProblem = sale!.sale_lines
      .filter((l) => isUnitLine(l) && (returnQty[l.id] ?? 0) > 0)
      .map((l) => frameReturnProblem(frameReturns[l.id] ?? DEFAULT_FRAME_RETURN))
      .find(Boolean);
    if (frameProblem) {
      setError(frameProblem);
      return;
    }
    if (refundsLoad && !approvalId && !isAdmin) {
      setAskingApproval(true);
      return;
    }
    setSaving(true);
    setError(null);
    const lines = sale!.sale_lines
      .filter((l) => (returnQty[l.id] ?? 0) > 0)
      .map((l) =>
        isUnitLine(l)
          ? frameReturnLine(l.id, frameReturns[l.id] ?? DEFAULT_FRAME_RETURN)
          : { sale_line_id: l.id, qty: returnQty[l.id] },
      );
    const { error: err } = await withRegisterDrawer(supabase.rpc('record_refund', {
      p_sale_id: saleId,
      p_lines: lines,
      p_payments: tenders.map(toPaymentPayload),
      p_reason: reason.trim() || null,
      p_note: null,
      p_method_change_reason: (needsMethodChangeReason && methodChangeReason.trim()) || null,
      p_approval_id: approvalId,
    }));
    setSaving(false);
    if (err) {
      const message = errorMessage(err);
      if (approvalId && isApprovalRefusal(message)) {
        // Refused for its approval: the next try asks the admin again.
        setKeptApproval(null);
      } else if (approvalId && approvalId !== keptApproval?.id) {
        // A minute short of the server's limit, so a retry doesn't race it.
        const expiresAt = Date.now() + (REFUND_APPROVAL_MINUTES - 1) * 60_000;
        setKeptApproval({ id: approvalId, lines: loadLineIds.join(','), expiresAt });
      }
      setError(message);
      return;
    }
    navigate(`/sales/${saleId}`);
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!sale) return <Spinner label="Loading…" />;

  const returnableLines = sale.sale_lines.filter((l) => (remaining[l.id] ?? 0) > 0);

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Return / Refund</h1>
          <p className="text-sm text-slate-500">
            {sale.customers ? customerNameLastFirst(sale.customers) : 'Unidentified Customer'}
          </p>
        </div>
        <button onClick={voidSale} className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">
          Void (full refund)
        </button>
      </div>

      <DayClosedNotice timeZone={settings?.time_zone ?? null} />
      <RegisterDrawerNotice cashNeedsDrawer={cashNeedsOpenDrawer(settings ?? null)} />

      {/* Items */}
      <section className="rounded-xl border border-slate-200 bg-white">
        {returnableLines.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Nothing left to return on this sale.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {returnableLines.map((l) =>
              isGiftCardLoadLine(l) ? (
                <li key={l.id} className="p-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={(returnQty[l.id] ?? 0) > 0}
                      disabled={!giftCardLoadUnused(l, cardBalances[l.gift_card_id ?? ''])}
                      onChange={(e) => setQty(l.id, e.target.checked ? l.qty : 0)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">
                        Gift card load{l.gift_cards ? ` · ${l.gift_cards.code}` : ''}
                      </span>
                      <span className="text-xs text-slate-500">
                        ${(l.qty * Number(l.unit_price)).toFixed(2)} ·{' '}
                        {giftCardLoadUnused(l, cardBalances[l.gift_card_id ?? ''])
                          ? 'comes back off the card; needs an admin'
                          : `the card has $${Number(cardBalances[l.gift_card_id ?? ''] ?? 0).toFixed(2)} left, so this load has been used`}
                      </span>
                    </span>
                  </label>
                </li>
              ) : isStringingLine(l) ? (
                <li key={l.id} className="p-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={(returnQty[l.id] ?? 0) > 0}
                      disabled={waitingForPickup(l)}
                      onChange={(e) => setQty(l.id, e.target.checked ? 1 : 0)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">
                        {l.kind === 'string_change' ? 'String change' : 'Stringing'}
                        {l.string_jobs ? ` ${jobCode(l.string_jobs.job_number)}` : ''}
                      </span>
                      <span className="text-xs text-slate-500">
                        ${fromCents(refundPriceCents(l, refundedLines)).toFixed(2)} · {stringingLineNote(l)}
                      </span>
                    </span>
                  </label>
                </li>
              ) : isUnitLine(l) ? (
                <li key={l.id} className="p-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={(returnQty[l.id] ?? 0) > 0}
                      onChange={(e) => setQty(l.id, e.target.checked ? 1 : 0)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{lineLabel(l.products)}</span>
                      <span className="text-xs text-slate-500">${Number(l.unit_price).toFixed(2)} · return this frame</span>
                    </span>
                  </label>
                  {(returnQty[l.id] ?? 0) > 0 && (
                    <FrameReturnFields
                      frame={frameReturns[l.id] ?? DEFAULT_FRAME_RETURN}
                      problem={frameReturnProblem(frameReturns[l.id] ?? DEFAULT_FRAME_RETURN)}
                      onChange={(frame) => setFrameReturns((prev) => ({ ...prev, [l.id]: frame }))}
                    />
                  )}
                </li>
              ) : (
                <li key={l.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">{lineLabel(l.products)}</p>
                    <p className="text-xs text-slate-500">
                      ${Number(l.unit_price).toFixed(2)} each · {remaining[l.id]} returnable
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQty(l.id, (returnQty[l.id] ?? 0) - 1)} className="h-7 w-7 rounded border border-slate-300 hover:bg-slate-50">−</button>
                    <span className="w-8 text-center text-sm font-medium">{returnQty[l.id] ?? 0}</span>
                    <button onClick={() => setQty(l.id, (returnQty[l.id] ?? 0) + 1)} className="h-7 w-7 rounded border border-slate-300 hover:bg-slate-50">+</button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {/* Totals */}
      <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
        <Row label="Refund subtotal" value={subtotal} />
        {tax > 0 && <Row label="Tax" value={tax} />}
        <div className="flex justify-between border-t border-slate-100 pt-1">
          <span className="text-sm font-semibold text-slate-700">Refund total</span>
          <span className="text-xl font-bold text-slate-900">${total.toFixed(2)}</span>
        </div>
      </section>

      {/* Reason */}
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" className={`${inputClass} w-full`} />

      {/* Refund tenders */}
      {showRefundTenders && (
      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        {refundable.size > 0 && (
          <p className="text-xs text-slate-500">
            Left to give back the way the sale was paid:{' '}
            {[...refundable]
              .map(([source, cents]) => `${sourceLabel(source)} $${fromCents(cents).toFixed(2)}`)
              .join(' · ')}
          </p>
        )}
        <div className="flex justify-between text-sm">
          <span className="font-medium text-slate-700">Refund to</span>
          <span className={remainingToAllocate === 0 ? 'text-slate-500' : 'font-medium text-blue-700'}>
            {remainingToAllocate > 0 ? `$${remainingToAllocate.toFixed(2)} left` : 'fully allocated'}
          </span>
        </div>
        {tenders.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {tenders.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-700">
                  {paymentLabel(t.method, t.checkNumber)}
                  {t.code ? ` · ${t.code}` : ''}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-900">${t.amount.toFixed(2)}</span>
                  <button onClick={() => setTenders((p) => p.filter((x) => x.id !== t.id))} className="text-xs text-red-600 hover:underline">Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {remainingToAllocate > 0.005 && mode === 'none' && (
          <div className="grid grid-cols-2 gap-2">
            {refundMethodsFor(
              settings?.accept_checks ?? false,
              sale.sale_payments.some((p) => p.method === 'check'),
            )
              .filter((m) => m !== 'store_credit' || !saleCustomerInactive(sale))
              .map((m) => (
              <button key={m} onClick={() => setMode(m)} className="rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-800 hover:border-blue-300 hover:bg-blue-50">
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
        )}
        {(mode === 'cash' || mode === 'credit') && (
          <AmountAdder label={METHOD_LABEL[mode]} defaultValue={remainingToAllocate} onCancel={() => setMode('none')} onAdd={(amt) => addTender({ method: mode, amount: amt })} />
        )}
        {mode === 'store_credit' && (
          sale.customer_id ? (
            <AmountAdder label="Store credit" defaultValue={remainingToAllocate} onCancel={() => setMode('none')} onAdd={(amt) => addTender({ method: 'store_credit', amount: amt })} />
          ) : (
            <p className="text-sm text-amber-700">This sale has no customer, so store credit can't be issued. <button onClick={() => setMode('none')} className="text-blue-600 hover:underline">Back</button></p>
          )
        )}
        {mode === 'check' && (
          <CheckEntry
            label="Refund check amount"
            defaultValue={remainingToAllocate}
            remaining={remainingToAllocate}
            onCancel={() => setMode('none')}
            onAdd={(amount, checkNumber) => addTender({ method: 'check', amount, checkNumber })}
          />
        )}
        {mode === 'gift_card' && (
          <GiftCardRefundEntry
            defaultValue={remainingToAllocate}
            defaultCode={suggestedPayments.find((p) => p.gift_cards)?.gift_cards?.code ?? ''}
            customerId={sale.customer_id}
            onCancel={() => setMode('none')}
            onAdd={(amt, id, code) => addTender({ method: 'gift_card', amount: amt, giftCardId: id, code })}
            onError={setError}
          />
        )}
      </section>
      )}
      {!showRefundTenders && itemsChosen && (
        <p className="text-sm text-slate-500">These items sold for $0, so there's nothing to refund. They go back in stock.</p>
      )}

      {needsMethodChangeReason && (
        <label className="block space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <span className="text-sm font-medium text-amber-900">
            This refund sends more to {changedTypes.map(sourceLabel).join(' and ')} than the sale
            took that way. Why the different payment type? (optional)
          </span>
          <input
            value={methodChangeReason}
            onChange={(e) => setMethodChangeReason(e.target.value)}
            placeholder="Reason (optional)"
            className={`${inputClass} w-full bg-white`}
          />
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={() => void process()}
        disabled={
          saving ||
          !itemsChosen ||
          Math.abs(remainingToAllocate) > 0.005
        }
        className="w-full rounded-lg bg-red-600 px-4 py-3 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {saving
          ? 'Processing…'
          : itemsChosen && total === 0
            ? 'Return items · nothing to refund'
            : `Process refund · $${total.toFixed(2)}`}
      </button>

      {askingApproval && (
        <AdminApprovalDialog
          message={`Refunding a gift card load needs an admin. An admin can approve refunding $${fromCents(loadCents).toFixed(2)} of gift card loads on this sale by signing in here. You stay signed in.`}
          approveLabel="Approve refund"
          approve={(credentials) =>
            approveRefundAsAdmin(credentials, { saleId: sale.id, amount: fromCents(loadCents), saleLineIds: loadLineIds })
          }
          onApproved={(approvalId) => {
            setAskingApproval(false);
            void process(approvalId);
          }}
          onCancel={() => setAskingApproval(false)}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-sm text-slate-600">
      <span>{label}</span>
      <span className="font-medium text-slate-900">${value.toFixed(2)}</span>
    </div>
  );
}

function AmountAdder({ label, defaultValue, onCancel, onAdd }: { label: string; defaultValue: number; onCancel: () => void; onAdd: (amt: number) => void }) {
  const [value, setValue] = useState(defaultValue > 0 ? defaultValue.toFixed(2) : '');
  const subCent = hasSubCent(value);
  const amt = subCent ? 0 : roundMoney(Number(value) || 0);
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <span className="text-xs font-medium text-slate-500">{label} amount</span>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className={`${inputClass} w-full`} />
      {subCent && <p className="text-xs text-red-600">{SUB_CENT_MESSAGE}.</p>}
      <div className="flex gap-2">
        <button onClick={() => amt > 0 && onAdd(amt)} disabled={amt <= 0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Add ${amt.toFixed(2)}</button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}

// Refund onto a gift card: an existing card is looked up by its code (a typo
// no longer creates a card). A new card is issued only when asked for.
