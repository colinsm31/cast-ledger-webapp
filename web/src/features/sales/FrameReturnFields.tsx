import type { FrameReturn } from './returnable';

// What happens to a frame being returned (0070): back in stock, or retired
// because it's damaged, which needs a reason.
export function FrameReturnFields({
  frame,
  problem,
  onChange,
}: {
  frame: FrameReturn;
  problem: string | null;
  onChange: (frame: FrameReturn) => void;
}) {
  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={frame.status === 'in_stock'}
            onChange={() => onChange({ ...frame, status: 'in_stock' })}
          />
          Back in stock
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="radio"
            checked={frame.status === 'retired'}
            onChange={() => onChange({ ...frame, status: 'retired' })}
          />
          Damaged: retire it
        </label>
      </div>
      {frame.status === 'retired' && (
        <input
          value={frame.reason}
          onChange={(e) => onChange({ ...frame, reason: e.target.value })}
          placeholder="What's wrong with it? e.g. cracked throat"
          aria-label="Why the frame is retired"
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
      )}
      {problem && <p className="text-xs text-amber-700">{problem}</p>}
    </div>
  );
}
