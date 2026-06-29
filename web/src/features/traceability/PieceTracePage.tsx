import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { PieceWithDesign, Project, QCTest } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { TraceLayout } from './TraceLayout';
import { PieceTraceDocument } from './PieceTraceDocument';

const SELECT = '*, product_designs(family, name, drawing_no, revision)';

export function PieceTracePage() {
  const { pieceId } = useParams<{ pieceId: string }>();
  const [piece, setPiece] = useState<PieceWithDesign | null>(null);
  const [tests, setTests] = useState<QCTest[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pieceId) return;
    void (async () => {
      const [pieceRes, testsRes] = await Promise.all([
        supabase.from('pieces').select(SELECT).eq('id', pieceId).single(),
        supabase
          .from('qc_tests')
          .select('*')
          .eq('piece_id', pieceId)
          .order('tested_at', { ascending: true }),
      ]);
      if (pieceRes.error) {
        setError(errorMessage(pieceRes.error));
        return;
      }
      const loadedPiece = pieceRes.data as unknown as PieceWithDesign;
      setPiece(loadedPiece);
      setTests((testsRes.data ?? []) as QCTest[]);

      if (loadedPiece.project_id) {
        const { data } = await supabase
          .from('projects')
          .select('*')
          .eq('id', loadedPiece.project_id)
          .single();
        setProject((data as Project) ?? null);
      }
    })();
  }, [pieceId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!piece) return <Spinner label="Loading…" />;

  const projectLabel = project ? `${project.job_number} — ${project.name}` : undefined;

  return (
    <TraceLayout title={`Piece ${piece.mark_no}`} subtitle={projectLabel}>
      <PieceTraceDocument piece={piece} tests={tests} projectLabel={projectLabel} />
    </TraceLayout>
  );
}
