import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { GiftCardBalance } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { hasSubCent, SUB_CENT_MESSAGE } from '../../lib/money';
import { useBack } from '../../app/BackContext';

interface CardTxn {
  id: string;
  amount: number;
  reason: string | null;
  sale_id: string | null;
  created_at: string;
}

interface Result {
  card: GiftCardBalance;
  customer: { id: string; first_name: string; last_name: string } | null;
  txns: CardTxn[];
}

function txnLabel(t: CardTxn): string {
  if (t.reason === 'load') return 'Loaded';
  if (t.reason === 'redeem') return 'Redeemed';
  if (t.reason === 'adjust') return 'Adjusted';
  if (t.reason) return t.reason.charAt(0).toUpperCase() + t.reason.slice(1);
  return Number(t.amount) >= 0 ? 'Loaded' : 'Redeemed';
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function GiftCardLookupPage() {
  const [searchParams] = useSearchParams();
  useBack('/');
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [result, setResult] = useState<Result | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');
  const [adjBusy, setAdjBusy] = useState(false);
  const startRequest = useLatestRequest();

  const lookup = useCallback(async (raw: string) => {
    const c = raw.replace(/\s+/g, '').trim();
    // Only the latest lookup's answer is shown (#37).
    const isLatest = startRequest();
    setResult(null);
    setNotFound(null);
    setError(null);
    if (!c) return;
    setSearching(true);
    const { data, error: err } = await supabase
      .from('gift_card_balance')
      .select('*')
      .eq('code', c)
      .maybeSingle();
    if (!isLatest()) return;
    if (err) {
      setSearching(false);
      setError(errorMessage(err));
      return;
    }
    if (!data) {
      setSearching(false);
      setNotFound(c);
      return;
    }
    const card = data as GiftCardBalance;
    const [custRes, txnRes] = await Promise.all([
      card.customer_id
        ? supabase.from('customers').select('id, first_name, last_name').eq('id', card.customer_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('gift_card_txns')
        .select('id, amount, reason, sale_id, created_at')
        .eq('gift_card_id', card.gift_card_id)
        .order('created_at', { ascending: false }),
    ]);
    if (!isLatest()) return;
    setSearching(false);
    // A card whose history or owner didn't load isn't shown as "no history" (#36).
    const detailsError = ('error' in custRes ? custRes.error : null) ?? txnRes.error;
    if (detailsError) {
      setError(`Couldn't load this card's history: ${errorMessage(detailsError)}. Press Check to try again.`);
      return;
    }
    setResult({
      card,
      customer: (custRes.data as Result['customer']) ?? null,
      txns: (txnRes.data ?? []) as CardTxn[],
    });
  }, [startRequest]);

  // Look up automatically if arrived with ?code=.
  useEffect(() => {
    const initial = searchParams.get('code');
    if (initial) void lookup(initial);
  }, [searchParams, lookup]);

  // Adding value needs a reason; taking it off doesn't (the server enforces both).
  const adjNeedsReason = Number(adjAmount) > 0;
  const adjHasSubCent = hasSubCent(adjAmount);

  async function adjustBalance() {
    if (!result) return;
    const amt = Number(adjAmount);
    if (!amt) {
      setError('Enter a non-zero adjustment (use − to remove).');
      return;
    }
    if (adjHasSubCent) {
      setError(`${SUB_CENT_MESSAGE}.`);
      return;
    }
    if (adjNeedsReason && !adjReason.trim()) {
      setError('A reason is required to add value to a gift card.');
      return;
    }
    setAdjBusy(true);
    const { error: err } = await supabase.rpc('adjust_gift_card', {
      p_gift_card_id: result.card.gift_card_id,
      p_amount: amt,
      p_reason: adjReason.trim() || null,
    });
    setAdjBusy(false);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    setAdjusting(false);
    setAdjAmount('');
    setAdjReason('');
    await lookup(result.card.code);
  }

  return (
    <div className="max-w-xl space-y-5">
      <h1 className="text-xl font-bold text-slate-900">Gift card balance</h1>

      <div className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void lookup(code);
          }}
          placeholder="Scan or type a gift card code…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => void lookup(code)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Check
        </button>
      </div>

      {searching && <p className="text-sm text-slate-500">Searching…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {notFound && (
        <p className="text-sm text-slate-600">
          No gift card found for code <span className="font-mono font-medium">{notFound}</span>.
        </p>
      )}

      {result && (
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-medium text-slate-500">Card {result.card.code}</p>
          <p className="mt-1 text-4xl font-bold text-slate-900">${Number(result.card.balance).toFixed(2)}</p>
          <p className="mt-2 text-sm text-slate-500">
            {result.customer ? (
              <>
                Tied to{' '}
                <Link to={`/customers/${result.customer.id}`} className="text-blue-600 hover:underline">
                  {customerNameLastFirst(result.customer)}
                </Link>
              </>
            ) : (
              'Anonymous card'
            )}
          </p>
          {!adjusting && (
            <button
              onClick={() => {
                setAdjusting(true);
                setError(null);
              }}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Adjust balance
            </button>
          )}
          {adjusting && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
              <label className="w-28 space-y-1">
                <span className="text-xs font-medium text-slate-500">Amount (± )</span>
                <input
                  autoFocus
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  inputMode="decimal"
                  placeholder="-5.00"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex-1 min-w-[8rem] space-y-1">
                <span className="text-xs font-medium text-slate-500">
                  {adjNeedsReason ? 'Reason (required to add value)' : 'Reason'}
                </span>
                <input
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  placeholder="e.g. correction"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <button
                onClick={() => void adjustBalance()}
                disabled={adjBusy || adjHasSubCent || (adjNeedsReason && !adjReason.trim())}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {adjBusy ? 'Saving…' : 'Apply'}
              </button>
              <button
                onClick={() => {
                  setAdjusting(false);
                  setAdjAmount('');
                  setAdjReason('');
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              {adjHasSubCent && <p className="w-full text-xs text-red-600">{SUB_CENT_MESSAGE}.</p>}
            </div>
          )}
        </section>
      )}

      {result && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">History</h2>
          {result.txns.length === 0 ? (
            <p className="text-sm text-slate-500">No transactions yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {result.txns.map((t) => {
                const amt = Number(t.amount);
                return (
                  <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <span className="font-medium text-slate-800">{txnLabel(t)}</span>
                      {t.sale_id && (
                        <>
                          {' · '}
                          <Link to={`/sales/${t.sale_id}`} className="text-blue-600 hover:underline">
                            sale
                          </Link>
                        </>
                      )}
                      <p className="text-xs text-slate-500">{formatDateTime(t.created_at)}</p>
                    </div>
                    <span className={amt >= 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
                      {amt >= 0 ? '+' : '−'}${Math.abs(amt).toFixed(2)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
