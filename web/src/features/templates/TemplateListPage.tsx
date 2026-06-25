import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { ProductDesign } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

export function TemplateListPage() {
  const [designs, setDesigns] = useState<ProductDesign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('product_designs')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) setError(errorMessage(err));
      else setDesigns((data ?? []) as ProductDesign[]);
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Product families</h1>
        <Link
          to="/families/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New family
        </Link>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {designs === null && !error && <Spinner label="Loading…" />}
      {designs && designs.length === 0 && (
        <EmptyState title="No families yet" message="Create your first product family to get started." />
      )}
      {designs && designs.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {designs.map((design) => (
            <li key={design.id} className="p-4">
              <p className="font-medium text-slate-900">{design.name}</p>
              <p className="text-sm text-slate-500">
                {design.family} · {design.drawing_no} · rev {design.revision}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
