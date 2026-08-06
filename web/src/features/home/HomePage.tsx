import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';

type SearchResult =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'notFoundUpc'; upc: string }
  | { kind: 'customerStub'; term: string }
  | { kind: 'error'; message: string };

// Treat an all-digits (optionally space-separated) query as a UPC.
function isUpc(query: string): boolean {
  return /^[0-9\s]+$/.test(query);
}

export function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult>({ kind: 'idle' });

  async function runSearch() {
    const term = query.trim();
    if (!term) return;

    if (isUpc(term)) {
      const upc = term.replace(/\s+/g, '');
      setResult({ kind: 'searching' });
      const { data, error } = await supabase
        .from('variants')
        .select('id')
        .eq('barcode', upc)
        .maybeSingle();
      if (error) {
        setResult({ kind: 'error', message: errorMessage(error) });
        return;
      }
      if (data) {
        navigate(`/variants/${data.id}`);
      } else {
        setResult({ kind: 'notFoundUpc', upc });
      }
    } else {
      // Text search is reserved for customers (a later feature).
      setResult({ kind: 'customerStub', term });
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-slate-900">AceStock</h1>
        <p className="text-sm text-slate-600">
          Scan or type a UPC to find an item. Type a name to search customers (coming soon).
        </p>
      </div>

      <div className="flex gap-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (result.kind !== 'idle') setResult({ kind: 'idle' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runSearch();
          }}
          placeholder="Scan / type a UPC, or a customer name…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => void runSearch()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Search
        </button>
      </div>

      <SearchOutcome result={result} onCreateProduct={(upc) => navigate(`/products/new?upc=${encodeURIComponent(upc)}`)} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NavCard to="/products" label="Products" />
        <NavCard to="/sales/new" label="New sale" />
        <NavCard to="/sales" label="Sales" />
        <NavCard to="/categories" label="Categories" />
      </div>
    </div>
  );
}

function SearchOutcome({
  result,
  onCreateProduct,
}: {
  result: SearchResult;
  onCreateProduct: (upc: string) => void;
}) {
  switch (result.kind) {
    case 'idle':
      return null;
    case 'searching':
      return <p className="text-sm text-slate-500">Searching…</p>;
    case 'error':
      return <p className="text-sm text-red-600">{result.message}</p>;
    case 'customerStub':
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-600">
            Customer search is coming soon. No customer records yet for “{result.term}”.
          </p>
        </div>
      );
    case 'notFoundUpc':
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-sm text-slate-700">
            No item found for UPC <span className="font-mono font-medium">{result.upc}</span>.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onCreateProduct(result.upc)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Create product with this UPC
            </button>
            <button
              disabled
              title="Coming soon"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400"
            >
              Create customer
            </button>
            <button
              disabled
              title="Coming soon"
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-400"
            >
              Create other…
            </button>
          </div>
        </div>
      );
  }
}

function NavCard({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50"
    >
      {label}
    </Link>
  );
}
