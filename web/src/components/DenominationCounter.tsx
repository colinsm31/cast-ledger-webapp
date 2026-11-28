import { countTotal, DENOMINATIONS, OTHER_CASH_KEY, type CountForm } from '../lib/denominations';
import { formatMoney } from '../lib/money';

const inputClass =
  'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// Boxes for how many of each bill and coin, plus other cash, with the running
// total. Used for a drawer's float and its closing count.
export function DenominationCounter({
  value,
  onChange,
  label,
}: {
  value: CountForm;
  onChange: (next: CountForm) => void;
  label: string;
}) {
  const total = countTotal(value);
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-700">{label}</legend>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {DENOMINATIONS.map((denomination) => (
          <label key={denomination.key} className="flex items-center gap-2 text-sm text-slate-600">
            <span className="w-10 shrink-0">{denomination.label}</span>
            <input
              aria-label={`How many ${denomination.label}`}
              value={value[denomination.key] ?? ''}
              onChange={(e) => onChange({ ...value, [denomination.key]: e.target.value })}
              inputMode="numeric"
              placeholder="0"
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <label className="flex max-w-xs items-center gap-2 text-sm text-slate-600">
        <span className="shrink-0">Other cash (rolled coin, etc.)</span>
        <input
          aria-label="Other cash"
          value={value[OTHER_CASH_KEY] ?? ''}
          onChange={(e) => onChange({ ...value, [OTHER_CASH_KEY]: e.target.value })}
          inputMode="decimal"
          placeholder="0.00"
          className={inputClass}
        />
      </label>
      <p className="text-sm text-slate-700">
        Total: <span className="font-semibold">{total === null ? '—' : formatMoney(total)}</span>
      </p>
    </fieldset>
  );
}
