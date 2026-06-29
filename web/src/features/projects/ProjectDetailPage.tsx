import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { PieceStatus, PieceWithDesign, Project } from '../../types/domain';
import { PIECE_STATUS_ORDER } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { StatusBadge } from '../pieces/StatusBadge';
import { AssignPiecesPanel } from './AssignPiecesPanel';

const SELECT = '*, product_designs(family, name, drawing_no, revision)';

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [pieces, setPieces] = useState<PieceWithDesign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    const [projectRes, piecesRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase
        .from('pieces')
        .select(SELECT)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ]);
    if (projectRes.error) setError(errorMessage(projectRes.error));
    else {
      setProject(projectRes.data as Project);
      setPieces((piecesRes.data ?? []) as unknown as PieceWithDesign[]);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!project) return <Spinner label="Loading…" />;

  // Status counts in lifecycle order, only showing non-zero buckets.
  const counts = new Map<PieceStatus, number>();
  for (const piece of pieces) {
    counts.set(piece.status, (counts.get(piece.status) ?? 0) + 1);
  }
  const orderedCounts = PIECE_STATUS_ORDER.filter((s) => counts.has(s)).map((s) => ({
    status: s,
    count: counts.get(s) ?? 0,
  }));

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-900">{project.job_number}</h1>
            {project.is_stock && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">stock</span>
            )}
          </div>
          <p className="text-sm text-slate-500">{project.name}</p>
          {(project.client || project.location) && (
            <p className="text-xs text-slate-400">
              {[project.client, project.location].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <Link
          to={`/projects/${project.id}/trace`}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Export package
        </Link>
      </div>

      {/* Status summary */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'}
          </h2>
        </div>
        {orderedCounts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {orderedCounts.map(({ status, count }) => (
              <span key={status} className="flex items-center gap-1.5 text-sm text-slate-600">
                <StatusBadge status={status} />
                <span className="font-medium">{count}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Pieces */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Pieces</h2>
          <button
            onClick={() => setAssigning((v) => !v)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {assigning ? 'Done' : 'Assign existing pieces'}
          </button>
        </div>

        {assigning && (
          <AssignPiecesPanel
            projectId={project.id}
            onAssigned={async () => {
              await load();
            }}
          />
        )}

        {pieces.length === 0 ? (
          <p className="text-sm text-slate-500">No pieces in this project yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
            {pieces.map((piece) => (
              <li key={piece.id}>
                <Link
                  to={`/pieces/${piece.id}`}
                  className="flex items-center justify-between p-4 hover:bg-slate-50"
                >
                  <div>
                    <p className="font-medium text-slate-900">{piece.mark_no}</p>
                    <p className="text-sm text-slate-500">{piece.product_designs?.family ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={piece.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
