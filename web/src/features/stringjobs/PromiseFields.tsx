import { cellClass } from './stringJobForm';

// When the job will be ready, and whether it's a rush: used at drop-off and
// when changing a waiting job (Phase 3A).
export function PromiseFields({
  promised,
  rush,
  problem,
  onPromised,
  onRush,
}: {
  /** The datetime-local input's value. */
  promised: string;
  rush: boolean;
  problem: string | null;
  onPromised: (value: string) => void;
  onRush: (value: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-4">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-500">Promised by</span>
          <input
            type="datetime-local"
            value={promised}
            onChange={(e) => onPromised(e.target.value)}
            className={`${cellClass} w-56`}
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={rush} onChange={(e) => onRush(e.target.checked)} />
          Rush (top of the queue)
        </label>
      </div>
      {problem && <p className="text-xs text-amber-700">{problem}</p>}
    </div>
  );
}

/** A small "Rush" badge for the queue and the job page. */
export function RushBadge() {
  return <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">Rush</span>;
}
