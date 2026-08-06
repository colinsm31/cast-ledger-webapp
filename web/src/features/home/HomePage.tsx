import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import type { Customer } from '../../types/domain';
import { customerName } from '../../types/domain';

type SearchResult =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'notFoundUpc'; upc: string }
  | { kind: 'customers'; term: string; matches: Customer[] }
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
      // Text → search customers by name/phone/email.
      setResult({ kind: 'searching' });
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,` +
            `phone_number.ilike.%${term}%,email.ilike.%${term}%`,
        )
        .order('last_name')
        .order('first_name')
        .limit(25);
      if (error) {
        setResult({ kind: 'error', message: errorMessage(error) });
        return;
      }
      setResult({ kind: 'customers', term, matches: (data ?? []) as Customer[] });
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-bold text-slate-900">AceStock</h1>
        <p className="text-sm text-slate-600">
          Scan or type a UPC to find an item, or type a name to find a customer.
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

      <SearchOutcome
        result={result}
        onCreateProduct={(upc) => navigate(`/products/new?upc=${encodeURIComponent(upc)}`)}
        onOpenCustomer={(id) => navigate(`/customers/${id}`)}
        onCreateCustomer={() => navigate('/customers/new')}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <NavCard to="/products" label="Products" />
        <NavCard to="/sales/new" label="New sale" />
        <NavCard to="/sales" label="Sales" />
        <NavCard to="/customers" label="Customers" />
        <NavCard to="/categories" label="Categories" />
      </div>
    </div>
  );
}

function SearchOutcome({
  result,
  onCreateProduct,
  onOpenCustomer,
  onCreateCustomer,
}: {
  result: SearchResult;
  onCreateProduct: (upc: string) => void;
  onOpenCustomer: (id: string) => void;
  onCreateCustomer: () => void;
}) {
  switch (result.kind) {
    case 'idle':
      return null;
    case 'searching':
      return <p className="text-sm text-slate-500">Searching…</p>;
    case 'error':
      return <p className="text-sm text-red-600">{result.message}</p>;
    case 'customers':
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-700">
              {result.matches.length} customer{result.matches.length === 1 ? '' : 's'} matching “
              {result.term}”
            </p>
            <button
              onClick={onCreateCustomer}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              New customer
            </button>
          </div>
          {result.matches.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {result.matches.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => onOpenCustomer(c.id)}
                    className="flex w-full items-center justify-between py-2 text-left hover:text-blue-700"
                  >
                    <span className="font-medium">{customerName(c)}</span>
                    <span className="text-sm text-slate-500">
                      {[c.phone_number, c.email].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
