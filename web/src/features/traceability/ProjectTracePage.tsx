import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { PieceWithDesign, Project, QCTest } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { TraceLayout } from './TraceLayout';
import { PieceTraceDocument } from './PieceTraceDocument';

const SELECT = '*, product_designs(family, name, drawing_no, revision)';

export function ProjectTracePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [pieces, setPieces] = useState<PieceWithDesign[]>([]);
  const [testsByPiece, setTestsByPiece] = useState<Record<string, QCTest[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    void (async () => {
      setLoading(true);
      const [projectRes, piecesRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase
          .from('pieces')
          .select(SELECT)
          .eq('project_id', projectId)
          .order('mark_no'),
      ]);
      if (projectRes.error) {
        setError(errorMessage(projectRes.error));
        setLoading(false);
        return;
      }
      setProject(projectRes.data as Project);
      const loadedPieces = (piecesRes.data ?? []) as unknown as PieceWithDesign[];
      setPieces(loadedPieces);

      // Fetch all QC tests for these pieces in one query, then group by piece.
      if (loadedPieces.length > 0) {
        const ids = loadedPieces.map((p) => p.id);
        const { data: testRows } = await supabase
          .from('qc_tests')
          .select('*')
          .in('piece_id', ids)
          .order('tested_at', { ascending: true });
        const grouped: Record<string, QCTest[]> = {};
        for (const test of (testRows ?? []) as QCTest[]) {
          if (!test.piece_id) continue;
          (grouped[test.piece_id] ??= []).push(test);
        }
        setTestsByPiece(grouped);
      }
      setLoading(false);
    })();
  }, [projectId]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (loading || !project) return <Spinner label="Loading…" />;

  const subtitle = `${project.name}${project.client ? ` · ${project.client}` : ''}`;

  return (
    <TraceLayout title={`Project ${project.job_number}`} subtitle={subtitle}>
      <p className="mb-6 text-sm text-slate-600">
        {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'} in this package.
      </p>

      {pieces.length === 0 ? (
        <p className="text-sm text-slate-500">No pieces in this project.</p>
      ) : (
        <div className="space-y-8">
          {pieces.map((piece) => (
            <div key={piece.id} className="trace-piece-break">
              <PieceTraceDocument piece={piece} tests={testsByPiece[piece.id] ?? []} />
            </div>
          ))}
        </div>
      )}
    </TraceLayout>
  );
}
