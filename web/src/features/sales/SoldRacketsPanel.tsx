import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';

interface SoldRacket {
  id: string;
  customer_id: string;
  brand: string | null;
  model: string;
  barcode: string | null;
  string_jobs: { id: string; status: string }[];
}

// Frames sold to a customer join their racquets (0069): say so, and offer to
// string each one in the same visit (or open the job already started).
export function SoldRacketsPanel({ unitIds }: { unitIds: string[] }) {
  const [rackets, setRackets] = useState<SoldRacket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const key = unitIds.join(',');

  useEffect(() => {
    const ids = key.split(',').filter(Boolean);
    if (ids.length === 0) return;
    let active = true;
    void (async () => {
      const { data, error: err } = await supabase
        .from('customer_rackets')
        .select('id, customer_id, brand, model, barcode, string_jobs ( id, status )')
        .in('product_unit_id', ids)
        .eq('is_active', true);
      if (!active) return;
      if (err) setError(errorMessage(err));
      else setRackets((data ?? []) as SoldRacket[]);
    })();
    return () => {
      active = false;
    };
  }, [key]);

  if (error) return <p className="text-sm text-red-600">Couldn&apos;t check the customer&apos;s racquets: {error}</p>;
  if (rackets.length === 0) return null;

  return (
    <section className="space-y-2 rounded-xl border border-green-200 bg-green-50 p-4">
      {rackets.map((racket) => {
        const openJob = racket.string_jobs.find((job) => job.status === 'entered' || job.status === 'complete');
        const name = `${racket.brand ? `${racket.brand} ` : ''}${racket.model}`;
        return (
          <div key={racket.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-green-900">
            <span>
              <span className="font-semibold">{name}</span> is now one of the customer&apos;s racquets
              {racket.barcode ? `, tagged ${racket.barcode}` : ''}.
            </span>
            {openJob ? (
              <Link to={`/string-jobs/${openJob.id}`} className="font-medium text-blue-700 hover:underline">
                Open its string job
              </Link>
            ) : (
              <Link
                to={`/customers/${racket.customer_id}/rackets/${racket.id}/restring`}
                className="rounded-lg bg-blue-600 px-3 py-1.5 font-semibold text-white hover:bg-blue-700"
              >
                String it now
              </Link>
            )}
          </div>
        );
      })}
    </section>
  );
}
