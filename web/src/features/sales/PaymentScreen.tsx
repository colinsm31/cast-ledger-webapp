import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { GiftCardBalance, PaymentMethod } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { roundMoney } from '../../lib/saleMath';

export interface Tender {
  id: string;
  method: PaymentMethod;
  amount: number;
  giftCardId?: string;
  code?: string;
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  credit: 'Credit',
  gift_card: 'Gift Card',
  store_credit: 'Store Credit',
};

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function PaymentScreen({
  total,
  customerId,
  busy,
  error,
  onBack,
  onComplete,
}: {
  total: number;
  customerId: string | null;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onComplete: (tenders: Tender[]) => void;
}) {
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [mode, setMode] = useState<'none' | PaymentMethod>('none');
  const [localError, setLocalError] = useState<string | null>(null);

  const paid = useMemo(() => roundMoney(tenders.reduce((s, t) => s + t.amount, 0)), [tenders]);
  const remaining = roundMoney(total - paid);
  const settled = Math.abs(remaining) < 0.005;

  function addTender(t: Omit<Tender, 'id'>) {
    setTenders((prev) => [...prev, { ...t, id: crypto.randomUUID() }]);
    setMode('none');
    setLocalError(null);
  }
  function removeTender(id: string) {
    setTenders((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <button onClick={onBack} className="text-sm text-blue-600 hover:underline" disabled={busy}>
          ‹ Back to ticket
        </button>
        <h1 className="text-xl font-bold text-slate-900">Payment</h1>
      </div>

      {/* Running totals */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex justify-between text-sm text-slate-600">
          <span>Total</span>
          <span className="font-medium text-slate-900">${total.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm text-slate-600">
          <span>Paid</span>
          <span className="font-medium text-slate-900">${paid.toFixed(2)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-slate-100 pt-2">
          <span className="font-semibold text-slate-700">{remaining >= 0 ? 'Remaining' : 'Change'}</span>
          <span className={`text-lg font-bold ${settled ? 'text-slate-900' : 'text-blue-700'}`}>
            ${Math.abs(remaining).toFixed(2)}
          </span>
        </div>
      </section>

      {/* Tenders added */}
      {tenders.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {tenders.map((t) => (
            <li key={t.id} className="flex items-center justify-between p-3 text-sm">
              <span className="font-medium text-slate-800">
                {METHOD_LABEL[t.method]}
                {t.code ? ` · ${t.code}` : ''}
              </span>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-900">${t.amount.toFixed(2)}</span>
                <button onClick={() => removeTender(t.id)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add a tender */}
      {!settled && mode === 'none' && (
        <div className="grid grid-cols-2 gap-3">
          {(['cash', 'credit', 'gift_card', 'store_credit'] as PaymentMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setLocalError(null);
                setMode(m);
              }}
              className="rounded-xl border border-slate-200 bg-white p-5 text-base font-semibold text-slate-900 hover:border-blue-300 hover:bg-blue-50"
            >
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>
      )}

      {mode === 'cash' && (
        <AmountEntry
          label="Cash tendered"
          defaultValue={remaining > 0 ? remaining : 0}
          allowOverpay
          remaining={remaining}
          onCancel={() => setMode('none')}
          onSubmit={(applied) => addTender({ method: 'cash', amount: applied })}
        />
      )}
      {mode === 'credit' && (
        <AmountEntry
          label="Credit amount"
          defaultValue={remaining > 0 ? remaining : 0}
          remaining={remaining}
          onCancel={() => setMode('none')}
          onSubmit={(applied) => addTender({ method: 'credit', amount: applied })}
        />
      )}
      {mode === 'gift_card' && (
        <GiftCardEntry
          remaining={remaining}
          onCancel={() => setMode('none')}
          onApply={(amount, giftCardId, code) => addTender({ method: 'gift_card', amount, giftCardId, code })}
        />
      )}
      {mode === 'store_credit' && (
        <StoreCreditEntry
          remaining={remaining}
          customerId={customerId}
          onCancel={() => setMode('none')}
          onApply={(amount) => addTender({ method: 'store_credit', amount })}
        />
      )}

      {localError && <p className="text-sm text-red-600">{localError}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        onClick={() => onComplete(tenders)}
        disabled={busy || !settled || tenders.length === 0}
        className="w-full rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      >
        {busy ? 'Completing…' : 'Complete sale'}
      </button>
    </div>
  );
}

// Cash/credit amount entry. `allowOverpay` (cash) caps the applied amount at the
// remaining balance and reports change.
function AmountEntry({
  label,
  defaultValue,
  remaining,
  allowOverpay = false,
  onCancel,
  onSubmit,
}: {
  label: string;
  defaultValue: number;
  remaining: number;
  allowOverpay?: boolean;
  onCancel: () => void;
  onSubmit: (applied: number) => void;
}) {
  const [value, setValue] = useState(defaultValue > 0 ? String(defaultValue.toFixed(2)) : '');
  const entered = Number(value) || 0;
  const applied = allowOverpay ? Math.min(entered, remaining) : Math.min(entered, remaining);
  const change = allowOverpay && entered > remaining ? roundMoney(entered - remaining) : 0;

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className={inputClass} />
      {change > 0 && <p className="text-sm text-slate-600">Change due: ${change.toFixed(2)}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => applied > 0 && onSubmit(roundMoney(applied))}
          disabled={applied <= 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add ${roundMoney(applied).toFixed(2)}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}

function GiftCardEntry({
  remaining,
  onCancel,
  onApply,
}: {
  remaining: number;
  onCancel: () => void;
  onApply: (amount: number, giftCardId: string, code: string) => void;
}) {
  const [code, setCode] = useState('');
  const [card, setCard] = useState<GiftCardBalance | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  async function lookup() {
    const c = code.replace(/\s+/g, '').trim();
    setErr(null);
    setCard(null);
    if (!c) return;
    setLooking(true);
    const { data, error } = await supabase.from('gift_card_balance').select('*').eq('code', c).maybeSingle();
    setLooking(false);
    if (error) {
      setErr(errorMessage(error));
      return;
    }
    if (!data) {
      setErr(`No gift card found for code ${c}.`);
      return;
    }
    setCard(data as GiftCardBalance);
  }

  const applyAmount = card ? roundMoney(Math.min(Number(card.balance), remaining)) : 0;

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <span className="text-xs font-medium text-slate-500">Scan or enter gift card code</span>
      <div className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void lookup();
          }}
          className={inputClass}
        />
        <button onClick={() => void lookup()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          {looking ? '…' : 'Look up'}
        </button>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {card && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="text-slate-700">
            Card <span className="font-medium">{card.code}</span> has{' '}
            <span className="font-semibold text-slate-900">${Number(card.balance).toFixed(2)}</span>.
          </p>
          {Number(card.balance) <= 0 ? (
            <p className="mt-1 text-slate-500">No balance to apply.</p>
          ) : (
            <p className="mt-1 text-slate-700">
              Apply <span className="font-semibold">${applyAmount.toFixed(2)}</span> to this ticket?
            </p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        {card && applyAmount > 0 && (
          <button
            onClick={() => onApply(applyAmount, card.gift_card_id, card.code)}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Apply ${applyAmount.toFixed(2)}
          </button>
        )}
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}

function StoreCreditEntry({
  remaining,
  customerId,
  onCancel,
  onApply,
}: {
  remaining: number;
  customerId: string | null;
  onCancel: () => void;
  onApply: (amount: number) => void;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId) return;
    void (async () => {
      const { data, error } = await supabase
        .from('customer_store_credit')
        .select('balance')
        .eq('customer_id', customerId)
        .maybeSingle();
      if (error) setErr(errorMessage(error));
      else setBalance(data ? Number((data as { balance: number }).balance) : 0);
    })();
  }, [customerId]);

  if (!customerId) {
    return (
      <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Attach a customer to the sale to use store credit.
        <div>
          <button onClick={onCancel} className="mt-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700">
            Back
          </button>
        </div>
      </section>
    );
  }

  const applyAmount = balance != null ? roundMoney(Math.min(balance, remaining)) : 0;

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
      {err && <p className="text-red-600">{err}</p>}
      {balance == null ? (
        <p className="text-slate-500">Loading balance…</p>
      ) : (
        <p className="text-slate-700">
          Store credit balance: <span className="font-semibold text-slate-900">${balance.toFixed(2)}</span>
          {balance > 0 && (
            <>
              {' '}· apply <span className="font-semibold">${applyAmount.toFixed(2)}</span>?
            </>
          )}
        </p>
      )}
      <div className="flex gap-2">
        {applyAmount > 0 && (
          <button
            onClick={() => onApply(applyAmount)}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Apply ${applyAmount.toFixed(2)}
          </button>
        )}
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}
