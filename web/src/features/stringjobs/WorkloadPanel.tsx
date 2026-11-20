import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import {
  dayBounds,
  dayLabel,
  stringerWorkload,
  type AssignedJob,
  type CompletedJob,
} from '../../lib/stringerWorkload';

// Each stringer's jobs for a day: waiting, due that day, late, and finished
// that day (Phase 3A, 0064). The waiting jobs come from the queue; the
// finished ones are read for the day shown.
export function WorkloadPanel({ waiting, now }: { waiting: readonly AssignedJob[]; now: Date }) {
  const [dayOffset, setDayOffset] = useState(0);
  const [completed, setCompleted] = useState<CompletedJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
  const dayKey = day.getTime();

  useEffect(() => {
    let active = true;
    const { start, end } = dayBounds(new Date(dayKey));
    void (async () => {
      const { data, error: err } = await supabase
        .from('string_jobs')
        .select('strung_by, completed_at')
        .gte('completed_at', start.toISOString())
        .lt('completed_at', end.toISOString());
      if (!active) return;
      if (err) {
        setError(errorMessage(err));
        return;
      }
      setError(null);
      setCompleted((data ?? []) as CompletedJob[]);
    })();
    return () => {
      active = false;
    };
  }, [dayKey]);

  const loads = stringerWorkload(waiting, completed, day, now);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700">Workload</h2>
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setDayOffset((n) => n - 1)}
            aria-label="Previous day"
            className="rounded border border-slate-300 px-2 text-slate-600 hover:bg-slate-50"
          >
            ‹
          </button>
          <span className="w-24 text-center font-medium text-slate-700">{dayLabel(day, now)}</span>
          <button
            onClick={() => setDayOffset((n) => n + 1)}
            aria-label="Next day"
            className="rounded border border-slate-300 px-2 text-slate-600 hover:bg-slate-50"
          >
            ›
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">Couldn&apos;t load the finished jobs: {error}</p>}
      {loads.length === 0 ? (
        <p className="text-sm text-slate-500">Nothing waiting or finished.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1 font-medium">Stringer</th>
              <th className="py-1 text-right font-medium">Waiting</th>
              <th className="py-1 text-right font-medium">Due</th>
              <th className="py-1 text-right font-medium">Late</th>
              <th className="py-1 text-right font-medium">Done</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loads.map((load) => (
              <tr key={load.stringer ?? '(unassigned)'}>
                <td className="py-1 text-slate-800">{load.stringer ?? 'Unassigned'}</td>
                <td className="py-1 text-right">{load.waiting}</td>
                <td className="py-1 text-right">{load.due}</td>
                <td className={`py-1 text-right ${load.overdue > 0 ? 'font-semibold text-red-700' : ''}`}>{load.overdue}</td>
                <td className="py-1 text-right">{load.done}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
