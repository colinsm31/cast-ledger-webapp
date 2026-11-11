import { useState } from 'react';
import { hasSubCent, SUB_CENT_MESSAGE } from '../../lib/money';
import { roundMoney } from '../../lib/saleMath';
import { CHECK_NUMBER_MESSAGE, normalizeCheckNumber } from '../../lib/paymentMethods';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// A check taken or written: its amount (never more than `remaining`, as no
// change is given on a check) and its number. Used by the payment and refund
// screens.
export function CheckEntry({
  label,
  defaultValue,
  remaining,
  onCancel,
  onAdd,
}: {
  label: string;
  defaultValue: number;
  remaining: number;
  onCancel: () => void;
  onAdd: (amount: number, checkNumber: string) => void;
}) {
  const [value, setValue] = useState(defaultValue > 0 ? defaultValue.toFixed(2) : '');
  const [number, setNumber] = useState('');
  const subCent = hasSubCent(value);
  const amount = subCent ? 0 : roundMoney(Math.min(Number(value) || 0, remaining));
  const checkNumber = normalizeCheckNumber(number);
  const showNumberHint = number.trim() !== '' && !checkNumber;

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <input autoFocus value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" className={inputClass} />
      </label>
      <label className="block space-y-1">
        <span className="text-xs font-medium text-slate-500">Check number</span>
        <input value={number} onChange={(e) => setNumber(e.target.value)} inputMode="numeric" className={inputClass} />
      </label>
      {subCent && <p className="text-sm text-red-600">{SUB_CENT_MESSAGE}.</p>}
      {showNumberHint && <p className="text-sm text-red-600">{CHECK_NUMBER_MESSAGE}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => amount > 0 && checkNumber && onAdd(amount, checkNumber)}
          disabled={amount <= 0 || !checkNumber}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add ${amount.toFixed(2)}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}
