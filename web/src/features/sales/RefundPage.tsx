import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { JsonValue, PaymentMethod } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { useBack } from '../../app/BackContext';

const round2 = (n: number) => Math.round(n * 100) / 100;

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  credit: 'Credit',
  gift_card: 'Gift Card',
  store_credit: 'Store Credit',
};

interface SaleLine {
  id: string;
  product_id: string | null;
  qty: number;
  unit_price: number;
  products: { brand: string | null; name: string; attributes: Record<string, JsonValue> | null } | null;
}
interface SalePayment {
  method: PaymentMethod;
  amount: number;
  gift_card_id: string | null;
}
interface SaleData {
  id: string;
  tax_rate: number;
  customer_id: string | null;
  customers: { first_name: string; last_name: string } | null;
  sale_lines: SaleLine[];
  sale_payments: SalePayment[];
  refunds: { refund_lines: { sale_line_id: string; qty: number }[] }[];
}

interface Tender {
  id: string;
  method: PaymentMethod;
  amount: number;
  giftCardId?: string;
  code?: string;
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
          'id, tax_rate, customer_id, customers ( first_name, last_name ), sale_lines ( id, product_id, qty, unit_price, products ( brand, name, attributes ) ), sale_payments ( method, amount, gift_card_id ), refunds ( refund_lines ( sale_line_id, qty ) )',
        )
        .eq('id', saleId)
        .single();
      if (err) setLoadError(errorMessage(err));
      else setSale(data as unknown as SaleData);
    })();
  }, [saleId]);

  // Remaining returnable qty per product line (original minus already refunded).
  const remaining = useMemo(() => {
    const map: Record<string, number> = {};
    if (!sale) return map;
    const refunded: Record<string, number> = {};
    for (const r of sale.refunds ?? []) {
      for (const rl of r.refund_lines ?? []) {
        refunded[rl.sale_line_id] = (refunded[rl.sale_line_id] ?? 0) + rl.qty;
      }
    }
    for (const l of sale.sale_lines) {
      if (l.product_id) map[l.id] = l.qty - (refunded[l.id] ?? 0);
    }
    return map;
  }, [sale]);

  const taxRate = sale?.tax_rate ?? 0;
  const subtotal = useMemo(() => {
    if (!sale) return 0;
    return sale.sale_lines.reduce((s, l) => s + (returnQty[l.id] ?? 0) * l.unit_price, 0);
  }, [sale, returnQty]);
  const tax = round2((subtotal * taxRate) / 100);
  const total = round2(subtotal + tax);
  const allocated = round2(tenders.reduce((s, t) => s + t.amount, 0));
  const remainingToAllocate = round2(total - allocated);

  function setQty(lineId: string, qty: number) {
    const max = remaining[lineId] ?? 0;
    const v = Math.max(0, Math.min(qty, max));
    setReturnQty((prev) => ({ ...prev, [lineId]: v }));
  }

  function voidSale() {
    if (!sale) return;
    // Return everything still returnable, and prefill the original tenders.
    const q: Record<string, number> = {};
    for (const l of sale.sale_lines) if (l.product_id) q[l.id] = remaining[l.id] ?? 0;
    setReturnQty(q);
    setTenders(
      (sale.sale_payments ?? []).map((p) => ({
        id: crypto.randomUUID(),
        method: p.method,
        amount: Number(p.amount),
        giftCardId: p.gift_card_id ?? undefined,
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

  const returnableLines = sale.sale_lines.filter((l) => l.product_id && (remaining[l.id] ?? 0) > 0);

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
        {returnableLines.length === 0 ? (
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
          <GiftCardAdder defaultValue={remainingToAllocate} customerId={sale.customer_id} onCancel={() => setMode('none')} onAdd={(amt, id, code) => addTender({ method: 'gift_card', amount: amt, giftCardId: id, code })} onError={setError} />
        )}
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={() => void process()}
        disabled={saving || total <= 0 || Math.abs(remainingToAllocate) > 0.005}
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
  const amt = round2(Number(value) || 0);
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <span className="text-xs font-medium text-slate-500">{label} amount</span>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className={`${inputClass} w-full`} />
      <div className="flex gap-2">
        <button onClick={() => amt > 0 && onAdd(amt)} disabled={amt <= 0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Add ${amt.toFixed(2)}</button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}

function GiftCardAdder({ defaultValue, customerId, onCancel, onAdd, onError }: { defaultValue: number; customerId: string | null; onCancel: () => void; onAdd: (amt: number, id: string, code: string) => void; onError: (m: string) => void }) {
  const [code, setCode] = useState('');
  const [value, setValue] = useState(defaultValue > 0 ? defaultValue.toFixed(2) : '');
  const [busy, setBusy] = useState(false);
  const amt = round2(Number(value) || 0);

  async function add() {
    const c = code.replace(/\s+/g, '').trim();
    if (!c) { onError('Enter a gift card code.'); return; }
    if (amt <= 0) { onError('Enter an amount.'); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('ensure_gift_card', { p_code: c, p_customer_id: customerId });
    setBusy(false);
    if (error) { onError(errorMessage(error)); return; }
    onAdd(amt, data as string, c);
  }

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <span className="text-xs font-medium text-slate-500">Load onto gift card</span>
      <div className="flex gap-2">
        <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Card code" className={`${inputClass} flex-1`} />
        <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0.00" className={`${inputClass} w-24`} />
      </div>
      <div className="flex gap-2">
        <button onClick={() => void add()} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{busy ? '…' : `Add $${amt.toFixed(2)}`}</button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">Cancel</button>
      </div>
    </div>
  );
}
