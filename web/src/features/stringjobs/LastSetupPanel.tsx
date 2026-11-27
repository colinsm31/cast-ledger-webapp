import { stringSummary, type StringSetup } from './stringSummary';
import { formatDate } from '../../lib/dates';

export interface LastSetup {
  key: string;
  /** "Last time on this racquet", "Last time on Head Speed MP". */
  label: string;
  job: StringSetup & { entered_at: string };
}

// "Same as last time": past setups for this customer, each one tap from the
// form (Phase 3A). Nothing shows for a customer's first job.
export function LastSetupPanel({ setups, onUse }: { setups: LastSetup[]; onUse: (job: StringSetup) => void }) {
  if (setups.length === 0) return null;
  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Same as last time</h2>
      <ul className="divide-y divide-slate-100">
        {setups.map((setup) => (
          <li key={setup.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500">
                {setup.label} · {formatDate(setup.job.entered_at)}
              </p>
              <p className="text-sm text-slate-800">{stringSummary(setup.job)}</p>
            </div>
            <button
              type="button"
              onClick={() => onUse(setup.job)}
              className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-semibold text-blue-700 hover:bg-blue-50"
            >
              Use this
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
