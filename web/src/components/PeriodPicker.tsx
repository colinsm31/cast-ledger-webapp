import { PERIODS, type PeriodState } from '../lib/reportPeriod';

// Today / week / month / year to date / custom range, as on the Sales list
// and every report.
export function PeriodPicker({ state }: { state: PeriodState }) {
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, range } = state;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((option) => (
          <button
            key={option.value}
            onClick={() => setPeriod(option.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              period === option.value
                ? 'bg-blue-600 text-white'
                : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="block rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium text-slate-500">To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="block rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
      )}
      {period === 'custom' && !range && (
        <p className="text-sm text-slate-500">
          {customFrom && customTo ? 'The end date is before the start date.' : 'Choose a start and end date.'}
        </p>
      )}
    </div>
  );
}
