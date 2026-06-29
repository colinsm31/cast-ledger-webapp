import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Project } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

export function ProjectsListPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('projects')
        .select('*')
        .order('job_number');
      if (err) setError(errorMessage(err));
      else setProjects((data ?? []) as Project[]);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Projects</h1>
        <Link
          to="/projects/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New project
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {projects === null && !error && <Spinner label="Loading…" />}
      {projects && projects.length === 0 && (
        <EmptyState title="No projects yet" message="Create your first project to group pieces." />
      )}
      {projects && projects.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {projects.map((project) => (
            <li key={project.id}>
              <Link to={`/projects/${project.id}`} className="block p-4 hover:bg-slate-50">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{project.job_number}</span>
                  {project.is_stock && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      stock
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{project.name}</p>
                {project.client && <p className="text-xs text-slate-400">{project.client}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
