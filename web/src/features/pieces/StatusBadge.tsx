import type { PieceStatus } from '../../types/domain';

const META: Record<PieceStatus, { label: string; classes: string }> = {
  in_production: { label: 'In production', classes: 'bg-orange-100 text-orange-800' },
  curing: { label: 'Curing', classes: 'bg-yellow-100 text-yellow-800' },
  qc: { label: 'QC', classes: 'bg-purple-100 text-purple-800' },
  ready: { label: 'Ready', classes: 'bg-green-100 text-green-800' },
  staged: { label: 'Staged', classes: 'bg-blue-100 text-blue-800' },
  delivered: { label: 'Delivered', classes: 'bg-slate-100 text-slate-700' },
};

export function StatusBadge({ status }: { status: PieceStatus }) {
  const meta = META[status] ?? { label: status, classes: 'bg-slate-100 text-slate-700' };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${meta.classes}`}>
      {meta.label}
    </span>
  );
}
