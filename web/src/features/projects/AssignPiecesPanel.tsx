import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { PieceWithDesign } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { StatusBadge } from '../pieces/StatusBadge';

const SELECT = '*, product_designs(family, name, drawing_no, revision)';

// Lists currently-unassigned pieces and assigns the chosen ones to this project.
export function AssignPiecesPanel({
  projectId,
  onAssigned,
}: {
  projectId: string;
  onAssigned: () => Promise<void>;
}) {
  const [unassigned, setUnassigned] = useState<PieceWithDesign[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUnassigned = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('pieces')
      .select(SELECT)
      .is('project_id', null)
      .order('created_at', { ascending: false });
    if (err) setError(errorMessage(err));
    else setUnassigned((data ?? []) as unknown as PieceWithDesign[]);
  }, []);

  useEffect(() => {
    void loadUnassigned();
  }, [loadUnassigned]);

  async function assign(pieceId: string) {
    setBusyId(pieceId);
    setError(null);
    const { error: err } = await supabase
      .from('pieces')
      .update({ project_id: projectId })
      .eq('id', pieceId);
    setBusyId(null);
    if (err) {
      setError(errorMessage(err));
      return;
    }
    await loadUnassigned();
    await onAssigned();
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 space-y-2">
      <p className="text-xs font-medium text-slate-500">Unassigned pieces</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {unassigned === null ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : unassigned.length === 0 ? (
        <p className="text-sm text-slate-500">No unassigned pieces.</p>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {unassigned.map((piece) => (
            <li key={piece.id} className="flex items-center justify-between p-3">
              <div>
                <span className="font-medium text-slate-800">{piece.mark_no}</span>
                <span className="text-sm text-slate-500"> · {piece.product_designs?.family ?? '—'}</span>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={piece.status} />
                <button
                  onClick={() => void assign(piece.id)}
                  disabled={busyId === piece.id}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {busyId === piece.id ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
