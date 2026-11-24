import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { inactiveGiftCardMessage } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { useDialog } from '../../components/Dialog';
import { hasSubCent, parsePlainAmount, SUB_CENT_MESSAGE } from '../../lib/money';
import { roundMoney } from '../../lib/saleMath';

const inputClass = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';

/**
 * Money going back onto a gift card (a refund, or an exchange's give-back):
 * any active card, whatever its balance, or a new card issued with the typed
 * code. Shared by RefundPage and PaymentScreen's give-back.
 */
export function GiftCardRefundEntry({
  defaultValue,
  defaultCode = '',
  customerId,
  label = 'Refund to gift card',
  onCancel,
  onAdd,
  onError,
}: {
  defaultValue: number;
  /** A code to start with, e.g. the card that paid for the sale. */
  defaultCode?: string;
  /** Who a newly issued card belongs to. */
  customerId: string | null;
  label?: string;
  onCancel: () => void;
  onAdd: (amount: number, giftCardId: string, code: string) => void;
  onError: (message: string) => void;
}) {
  const { confirm } = useDialog();
  const [code, setCode] = useState(defaultCode);
  const [value, setValue] = useState(defaultValue > 0 ? defaultValue.toFixed(2) : '');
  const [busy, setBusy] = useState(false);
  const [missingCode, setMissingCode] = useState<string | null>(null);
  const subCent = hasSubCent(value);
  const amount = roundMoney(parsePlainAmount(value) ?? 0);
  const notAnAmount = value.trim() !== '' && !subCent && parsePlainAmount(value) === null;
  // Gone (closed by the screen around it): a lookup still in flight adds nothing.
  const gone = useRef(false);
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
    };
  }, []);

  function checkInput(): string | null {
    const trimmedCode = code.replace(/\s+/g, '').trim();
    if (!trimmedCode) {
      onError('Enter a gift card code.');
      return null;
    }
    if (amount <= 0) {
      onError('Enter an amount.');
      return null;
    }
    return trimmedCode;
  }

  async function add() {
    const trimmedCode = checkInput();
    if (!trimmedCode) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('gift_card_balance')
      .select('gift_card_id, code, is_active')
      .eq('code', trimmedCode)
      .maybeSingle();
    if (gone.current) return;
    setBusy(false);
    if (error) {
      onError(errorMessage(error));
      return;
    }
    if (!data) {
      setMissingCode(trimmedCode);
      return;
    }
    if (!data.is_active) {
      onError(inactiveGiftCardMessage(data.code as string));
      return;
    }
    onAdd(amount, data.gift_card_id as string, data.code as string);
  }

  async function issueNewCard() {
    const trimmedCode = checkInput();
    if (!trimmedCode) return;
    const ok = await confirm({
      title: 'Issue a new gift card?',
      message: `No card has code ${trimmedCode}. A new card with this code gets $${amount.toFixed(2)}. It didn't pay for this sale, so you'll be asked for a reason.`,
      confirmLabel: 'Issue new card',
    });
    if (!ok || gone.current) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('ensure_gift_card', { p_code: trimmedCode, p_customer_id: customerId });
    if (gone.current) return;
    setBusy(false);
    if (error) {
      onError(errorMessage(error));
      return;
    }
    onAdd(amount, data as string, trimmedCode);
  }

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <div className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setMissingCode(null);
          }}
          placeholder="Card code"
          className={`${inputClass} flex-1`}
        />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          className={`${inputClass} w-24`}
        />
      </div>
      {subCent && <p className="text-xs text-red-600">{SUB_CENT_MESSAGE}.</p>}
      {notAnAmount && <p className="text-xs text-red-600">Enter an amount like 12.50.</p>}
      {missingCode && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-red-600">No gift card with code {missingCode}.</span>
          <button
            onClick={() => void issueNewCard()}
            disabled={busy}
            className="text-blue-600 hover:underline disabled:opacity-50"
          >
            Issue a new card with this code
          </button>
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => void add()}
          disabled={busy || amount <= 0}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? '…' : `Add $${amount.toFixed(2)}`}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
