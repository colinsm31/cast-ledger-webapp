import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { PieceWithDesign } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from './StatusBadge';

const SELECT = '*, product_designs(family, name, drawing_no, revision)';

export function PiecesListPage() {
  const [pieces, setPieces] = useState<PieceWithDesign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('pieces')
        .select(SELECT)
        .order('created_at', { ascending: false });
      if (err) setError(errorMessage(err));
      else setPieces((data ?? []) as unknown as PieceWithDesign[]);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Pieces</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {pieces === null && !error && <Spinner label="Loading…" />}
      {pieces && pieces.length === 0 && (
        <EmptyState title="No pieces yet" message="Create a piece to see it here." />
      )}
      {pieces && pieces.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {pieces.map((piece) => (
            <li key={piece.id}>
              <Link to={`/pieces/${piece.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50">
                <div>
                  <p className="font-medium text-slate-900">{piece.mark_no}</p>
                  <p className="text-sm text-slate-500">{piece.product_designs?.family ?? '—'}</p>
                  {piece.yard_location && (
                    <p className="text-xs text-slate-400">📍 {piece.yard_location}</p>
                  )}
                </div>
                <StatusBadge status={piece.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
