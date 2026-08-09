import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import type { Customer } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';

type UpcResult =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'notFoundUpc'; upc: string }
  | { kind: 'error'; message: string };

// Treat an all-digits (optionally space-separated) query as a UPC.
function isUpc(query: string): boolean {
  return /^[0-9\s]+$/.test(query);
}

export function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Customer[]>([]);
  const [searchingNames, setSearchingNames] = useState(false);
  const [upcResult, setUpcResult] = useState<UpcResult>({ kind: 'idle' });

  const term = query.trim();
  const isNameQuery = term.length > 0 && !isUpc(term);

  // Predictive customer-name search: query live as the user types (debounced),
  // ordered last name, first name.
  useEffect(() => {
    if (!isNameQuery) {
      setMatches([]);
      setSearchingNames(false);
      return;
    }
    let active = true;
    setSearchingNames(true);
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .order('last_name')
        .order('first_name')
        .limit(8);
      if (!active) return;
      setMatches((data ?? []) as Customer[]);
      setSearchingNames(false);
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [term, isNameQuery]);

  async function runUpc() {
    const upc = term.replace(/\s+/g, '');
    setUpcResult({ kind: 'searching' });
    // A barcode may belong to an inventory product or a customer's racket.
    const [productRes, racketRes] = await Promise.all([
      supabase.from('products').select('id').eq('barcode', upc).maybeSingle(),
      supabase.from('customer_rackets').select('id, customer_id').eq('barcode', upc).maybeSingle(),
    ]);
    if (productRes.error || racketRes.error) {
      setUpcResult({ kind: 'error', message: errorMessage(productRes.error ?? racketRes.error) });
      return;
    }
    if (productRes.data) {
      navigate(`/products/${productRes.data.id}`);
      return;
    }
    if (racketRes.data) {
      const racketId = racketRes.data.id;
      const customerId = racketRes.data.customer_id;
      // Reopen the racket's open job (entered/complete) or start a new one.
      const { data: openJob } = await supabase
        .from('string_jobs')
        .select('id')
        .eq('customer_racket_id', racketId)
        .in('status', ['entered', 'complete'])
        .order('entered_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      navigate(
        openJob ? `/string-jobs/${openJob.id}` : `/customers/${customerId}/rackets/${racketId}/restring`,
      );
      return;
    }
    // A gift card? Show its balance.
    const { data: gc } = await supabase
      .from('gift_card_balance')
      .select('code')
      .eq('code', upc)
      .maybeSingle();
    if (gc) {
      navigate(`/gift-cards?code=${encodeURIComponent(upc)}`);
      return;
    }
    setUpcResult({ kind: 'notFoundUpc', upc });
  }

  const createCustomerUrl = `/customers/new?name=${encodeURIComponent(term)}`;

  function onSubmit() {
    if (!term) return;
    if (isUpc(term)) {
      void runUpc();
    } else if (matches.length > 0) {
      // Enter jumps to the top predictive match.
      navigate(`/customers/${matches[0].id}`);
    } else if (!searchingNames) {
      // No such customer — open the create screen prefilled with the typed name.
      navigate(createCustomerUrl);
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
            if (upcResult.kind !== 'idle') setUpcResult({ kind: 'idle' });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSubmit();
          }}
          placeholder="Scan / type a UPC, or a customer name…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={onSubmit}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Search
        </button>
      </div>

      {/* Predictive customer-name results */}
      {isNameQuery && (
        <div className="rounded-xl border border-slate-200 bg-white p-2">
          {matches.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {matches.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => navigate(`/customers/${c.id}`)}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{customerNameLastFirst(c)}</span>
                    <span className="text-sm text-slate-500">
                      {[c.phone_number, c.email].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-2 text-sm text-slate-500">
              {searchingNames ? 'Searching…' : `No customer named “${term}”.`}
            </p>
          )}
          <div className="border-t border-slate-100 px-2 pt-2">
            <button
              onClick={() => navigate(createCustomerUrl)}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              + Create new customer{matches.length === 0 && !searchingNames ? ` “${term}”` : ''}
            </button>
          </div>
        </div>
      )}

      {/* UPC scan outcome */}
      {isUpc(term) && upcResult.kind === 'searching' && (
        <p className="text-sm text-slate-500">Searching…</p>
      )}
      {upcResult.kind === 'error' && <p className="text-sm text-red-600">{upcResult.message}</p>}
      {upcResult.kind === 'notFoundUpc' && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <p className="text-sm text-slate-700">
            No item found for UPC <span className="font-mono font-medium">{upcResult.upc}</span>.
          </p>
          <button
            onClick={() => navigate(`/products/new?upc=${encodeURIComponent(upcResult.upc)}`)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Create product with this UPC
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <NavCard to="/products" label="Products" />
        <NavCard to="/customers" label="Customers" />
        <NavCard to="/gift-cards" label="Gift Cards" />
        <NavCard to="/string-jobs/open" label="Open Re-Strings" />
        <NavCard to="/string-jobs/completed" label="Completed Re-Strings" />
        <NavCard to="/categories" label="Categories" />
      </div>
    </div>
  );
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
