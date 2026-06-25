import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { ProductDesign } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

export function PieceFamilyPickerPage() {
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
      <h1 className="text-xl font-bold text-slate-900">New piece — pick a family</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {designs === null && !error && <Spinner label="Loading…" />}
      {designs && designs.length === 0 && (
        <EmptyState title="No families yet" message="Define a product family first, then create pieces against it." />
      )}
      {designs && designs.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {designs.map((design) => (
            <li key={design.id}>
              <Link to={`/pieces/new/${design.id}`} className="block p-4 hover:bg-slate-50">
                <p className="font-medium text-slate-900">{design.name}</p>
                <p className="text-sm text-slate-500">
                  {design.family} · {design.drawing_no} · rev {design.revision}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
