import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { JsonValue, PaymentMethod } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { useBack } from '../../app/BackContext';
import { useDialog } from '../../components/Dialog';
import { hasSubCent, SUB_CENT_MESSAGE } from '../../lib/money';
import { isUnitLine, returnableQty } from './returnable';
import {
  allocateToOriginalPayments,
  computeSaleTotals,
  fromCents,
  paymentTypeChanges,
  refundableByMethod,
  refundSource,
  refundTaxCents,
  roundMoney,
  toCents,
} from '../../lib/saleMath';

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  credit: 'Credit',
  gift_card: 'Gift Card',
  store_credit: 'Store Credit',
};

interface SaleLine {
  id: string;
  product_id: string | null;
  product_unit_id: string | null;
  qty: number;
  unit_price: number;
  products: { brand: string | null; name: string; attributes: Record<string, JsonValue> | null } | null;
}
interface SalePayment {
  method: PaymentMethod;
  amount: number;
  gift_card_id: string | null;
  gift_cards: { code: string } | null;
}
interface EarlierRefund {
  subtotal: number;
  tax: number;
  refund_lines: { sale_line_id: string; qty: number }[];
  refund_payments: { method: PaymentMethod; amount: number; gift_card_id: string | null }[];
}
interface SaleData {
  id: string;
  tax: number;
  tax_rate: number;
  customer_id: string | null;
  customers: { first_name: string; last_name: string } | null;
  sale_lines: SaleLine[];
  sale_payments: SalePayment[];
  refunds: EarlierRefund[];
}

interface Tender {
  id: string;
  method: PaymentMethod;
  amount: number;
  giftCardId?: string;
  code?: string;
}

// Payments keyed by what limits a refund: the type, or the gift card itself.
function bySource(payments: { method: PaymentMethod; amount: number; gift_card_id: string | null }[]) {
  return payments.map((p) => ({ method: refundSource(p.method, p.gift_card_id), amount: p.amount }));
}

function lineLabel(p: SaleLine['products']): string {
  if (!p) return '—';
  const attrs = Object.values(p.attributes ?? {}).filter((v) => v != null && v !== '').map(String);
  return [p.brand, p.name, ...attrs].filter(Boolean).join(' ');
}

const inputClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

export function RefundPage() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  useBack(`/sales/${saleId}`);

  const [sale, setSale] = useState<SaleData | null>(null);
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [reason, setReason] = useState('');
  const [methodChangeReason, setMethodChangeReason] = useState('');
  const [mode, setMode] = useState<'none' | PaymentMethod>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!saleId) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from('sales')
        .select(
          [
            'id, tax, tax_rate, customer_id',
            'customers ( first_name, last_name )',
            'sale_lines ( id, product_id, product_unit_id, qty, unit_price, products ( brand, name, attributes ) )',
            'sale_payments ( method, amount, gift_card_id, gift_cards ( code ) )',
            'refunds ( subtotal, tax, refund_lines ( sale_line_id, qty ), refund_payments ( method, amount, gift_card_id ) )',
          ].join(', '),
        )
        .eq('id', saleId)
        .single();
      if (err) setLoadError(errorMessage(err));
      else setSale(data as unknown as SaleData);
    })();
  }, [saleId]);

  // Remaining returnable qty per product line (original minus already refunded).
  // Remaining returnable qty per line (racquet units can't be returned yet).
  const remaining = useMemo(
    () => (sale ? returnableQty(sale.sale_lines, (sale.refunds ?? []).flatMap((r) => r.refund_lines ?? [])) : {}),
    [sale],
  );

  // Refund subtotal, tax and total for a set of return quantities. Tax follows
  // record_refund: cumulative over this sale's refunds, at the sale's rate, and
  // never more than the sale charged.
  function refundTotalsFor(qty: Record<string, number>) {
    if (!sale) return { subtotal: 0, tax: 0, total: 0 };
    const { subtotal } = computeSaleTotals(
      sale.sale_lines.map((l) => ({ qty: qty[l.id] ?? 0, price: l.unit_price })),
      { taxRate: 0, taxStringing: false },
    );
    const refundSubtotalCents = toCents(subtotal);
    const taxCentsForRefund = refundTaxCents({
      previousSubtotalCents: sale.refunds.reduce((s, r) => s + toCents(r.subtotal), 0),
      previousTaxCents: sale.refunds.reduce((s, r) => s + toCents(r.tax), 0),
      saleTaxCents: toCents(sale.tax),
      refundSubtotalCents,
      taxRate: sale.tax_rate,
    });
    return {
      subtotal,
      tax: fromCents(taxCentsForRefund),
      total: fromCents(refundSubtotalCents + taxCentsForRefund),
    };
  }

  const { subtotal, tax, total } = useMemo(
    () => refundTotalsFor(returnQty),
    // refundTotalsFor only reads `sale`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sale, returnQty],
  );
  const allocated = roundMoney(tenders.reduce((s, t) => s + t.amount, 0));
  const remainingToAllocate = roundMoney(total - allocated);

  // What each payment type the sale used can still give back (a gift card
  // only to the card that paid), and which this refund over-sends to (a
  // payment-type change, which needs a reason).
  const refundable = useMemo(
    () =>
      refundableByMethod(
        bySource(sale?.sale_payments ?? []),
        bySource((sale?.refunds ?? []).flatMap((r) => r.refund_payments)),
      ),
    [sale],
  );
  const changedTypes = paymentTypeChanges(
    refundable,
    tenders.map((t) => ({ method: refundSource(t.method, t.giftCardId), amount: t.amount })),
  );
  // "Cash", or "Gift Card GC-123" for a card.
  const cardCodes = useMemo(() => {
    const codes = new Map<string, string>();
    for (const p of sale?.sale_payments ?? []) if (p.gift_card_id && p.gift_cards) codes.set(p.gift_card_id, p.gift_cards.code);
    for (const t of tenders) if (t.giftCardId && t.code) codes.set(t.giftCardId, t.code);
    return codes;
  }, [sale, tenders]);
  function sourceLabel(source: string): string {
    const [method, cardId] = source.split(':') as [PaymentMethod, string | undefined];
    return cardId ? `${METHOD_LABEL[method]} ${cardCodes.get(cardId) ?? ''}`.trim() : METHOD_LABEL[method];
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
    for (const id of Object.keys(remaining)) q[id] = remaining[id];
    setReturnQty(q);
    // Send the money back the way it came, up to what each payment type can
    // still give back; anything left over is for the cashier to place.
    const { allocations } = allocateToOriginalPayments(
      toCents(refundTotalsFor(q).total),
      sale.sale_payments ?? [],
      refundable,
      (p) => refundSource(p.method, p.gift_card_id),
    );
    setTenders(
      allocations.map(({ payment, cents }) => ({
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

  async function process() {
    if (total <= 0) {
      setError('Choose at least one item to return.');
      return;
    }
    if (Math.abs(remainingToAllocate) > 0.005) {
      setError('Refund tender must equal the refund total.');
      return;
    }
    if (needsMethodChangeReason && !methodChangeReason.trim()) {
      setError('Give a reason for refunding to a different payment type.');
      return;
    }
    setSaving(true);
    setError(null);
    const lines = sale!.sale_lines
      .filter((l) => (returnQty[l.id] ?? 0) > 0)
      .map((l) => ({ sale_line_id: l.id, qty: returnQty[l.id] }));
    const { error: err } = await supabase.rpc('record_refund', {
      p_sale_id: saleId,
      p_lines: lines,
      p_payments: tenders.map((t) => ({ method: t.method, amount: t.amount, gift_card_id: t.giftCardId ?? null })),
      p_reason: reason.trim() || null,
      p_note: null,
      p_method_change_reason: needsMethodChangeReason ? methodChangeReason.trim() : null,
    });
    setSaving(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    navigate(`/sales/${saleId}`);
  }

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!sale) return <Spinner label="Loading…" />;

  const returnableLines = sale.sale_lines.filter((l) => (remaining[l.id] ?? 0) > 0);
  const unitLines = sale.sale_lines.filter(isUnitLine);

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

      {/* Items */}
      <section className="rounded-xl border border-slate-200 bg-white">
        {returnableLines.length === 0 && unitLines.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Nothing left to return on this sale.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {returnableLines.map((l) => (
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
            ))}
            {unitLines.map((l) => (
              <li key={l.id} className="p-3">
                <p className="truncate font-medium text-slate-500">{lineLabel(l.products)}</p>
                <p className="text-xs text-slate-500">Racquet returns aren't supported yet.</p>
              </li>
            ))}
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
      <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
        {refundable.size > 0 && (
          <p className="text-xs text-slate-500">
            Can go back without a reason:{' '}
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
                  {METHOD_LABEL[t.method]}
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
            {(['cash', 'credit', 'store_credit', 'gift_card'] as PaymentMethod[]).map((m) => (
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
        {mode === 'gift_card' && (
          <GiftCardAdder defaultValue={remainingToAllocate} defaultCode={sale.sale_payments.find((p) => p.gift_cards)?.gift_cards?.code ?? ''} customerId={sale.customer_id} onCancel={() => setMode('none')} onAdd={(amt, id, code) => addTender({ method: 'gift_card', amount: amt, giftCardId: id, code })} onError={setError} />
        )}
      </section>

      {needsMethodChangeReason && (
        <label className="block space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <span className="text-sm font-medium text-amber-900">
            This refund sends more to {changedTypes.map(sourceLabel).join(' and ')} than the sale
            took that way. Why the different payment type?
          </span>
          <input
            value={methodChangeReason}
            onChange={(e) => setMethodChangeReason(e.target.value)}
            placeholder="Reason (required)"
            className={`${inputClass} w-full bg-white`}
          />
        </label>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={() => void process()}
        disabled={
          saving ||
          total <= 0 ||
          Math.abs(remainingToAllocate) > 0.005 ||
          (needsMethodChangeReason && !methodChangeReason.trim())
        }
        className="w-full rounded-lg bg-red-600 px-4 py-3 text-base font-semibold text-white hover:bg-red-700 disabled:opacity-50"
      >
        {saving ? 'Processing…' : `Process refund · $${total.toFixed(2)}`}
      </button>
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
function GiftCardAdder({ defaultValue, defaultCode, customerId, onCancel, onAdd, onError }: { defaultValue: number; defaultCode: string; customerId: string | null; onCancel: () => void; onAdd: (amt: number, id: string, code: string) => void; onError: (m: string) => void }) {
  const { confirm } = useDialog();
  const [code, setCode] = useState(defaultCode);
  const [value, setValue] = useState(defaultValue > 0 ? defaultValue.toFixed(2) : '');
  const [busy, setBusy] = useState(false);
  const [missingCode, setMissingCode] = useState<string | null>(null);
  const subCent = hasSubCent(value);
  const amt = subCent ? 0 : roundMoney(Number(value) || 0);

  function checkInput(): string | null {
    const c = code.replace(/\s+/g, '').trim();
    if (!c) { onError('Enter a gift card code.'); return null; }
    if (amt <= 0) { onError('Enter an amount.'); return null; }
    return c;
  }

  async function add() {
    const c = checkInput();
    if (!c) return;
    setBusy(true);
    const { data, error } = await supabase.from('gift_card_balance').select('gift_card_id, code').eq('code', c).maybeSingle();
    setBusy(false);
    if (error) { onError(errorMessage(error)); return; }
    if (!data) { setMissingCode(c); return; }
    onAdd(amt, data.gift_card_id as string, data.code as string);
  }

  async function issueNewCard() {
    const c = checkInput();
    if (!c) return;
    const ok = await confirm({
      title: 'Issue a new gift card?',
      message: `No card has code ${c}. A new card with this code gets $${amt.toFixed(2)}. It didn't pay for this sale, so you'll be asked for a reason.`,
      confirmLabel: 'Issue new card',
    });
    if (!ok) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('ensure_gift_card', { p_code: c, p_customer_id: customerId });
    setBusy(false);
    if (error) { onError(errorMessage(error)); return; }
    onAdd(amt, data as string, c);
  }

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <span className="text-xs font-medium text-slate-500">Refund to gift card</span>
      <div className="flex gap-2">
        <input autoFocus value={code} onChange={(e) => { setCode(e.target.value); setMissingCode(null); }} placeholder="Card code" className={`${inputClass} flex-1`} />
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputClass} w-24`} />
      </div>
      {subCent && <p className="text-xs text-red-600">{SUB_CENT_MESSAGE}.</p>}
      {missingCode && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-red-600">No gift card with code {missingCode}.</span>
          <button onClick={() => void issueNewCard()} disabled={busy} className="text-blue-600 hover:underline disabled:opacity-50">
            Issue a new card with this code
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => void add()} disabled={busy || amt <= 0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? '…' : `Add $${amt.toFixed(2)}`}</button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}
