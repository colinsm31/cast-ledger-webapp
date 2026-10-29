import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchAllRows } from '../../lib/paging';
import { searchCustomers } from '../../lib/customerSearch';
import type { Customer } from '../../types/domain';
import { customerName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { useBack } from '../../app/BackContext';
import { ScanFlowParams, withParams } from '../scan/scanFlow';

// The most matches search_customers returns; more means "type more".
const SEARCH_RESULT_LIMIT = 50;

export function CustomersListPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Search results (null while not searching), from the same search as Home:
  // "first last", "last, first", email, or phone digits (#23).
  const [matches, setMatches] = useState<Customer[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  useBack('/');
  const [searchParams] = useSearchParams();
  // Arrived from a home-screen scan: we're picking who owns this racket, so
  // every customer link (and "New customer") carries the barcode along.
  const racketBarcode = searchParams.get(ScanFlowParams.racketBarcode);
  const carryBarcode = (path: string) => withParams(path, { [ScanFlowParams.racketBarcode]: racketBarcode });

  // Every customer, a page at a time: one request returns at most 1,000 rows.
  // Paging needs a unique order (id), so the name order is applied here.
  useEffect(() => {
    let active = true;
    fetchAllRows<Customer>('customers', '*', 'id').then(
      (rows) => {
        if (!active) return;
        const byName = (c: Customer) => `${c.last_name ?? ''}\u0000${c.first_name}`.toLowerCase();
        setCustomers([...rows].sort((a, b) => byName(a).localeCompare(byName(b))));
      },
      (err: unknown) => {
        if (active) setError(errorMessage(err));
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // Search as the user types (debounced); an older response never replaces a newer one.
  const term = search.trim();
  useEffect(() => {
    if (!term) {
      setMatches(null);
      setSearchError(null);
      return;
    }
    let active = true;
    const handle = setTimeout(() => {
      searchCustomers(term, SEARCH_RESULT_LIMIT).then(
        (found) => {
          if (!active) return;
          setMatches(found);
          setSearchError(null);
        },
        (err: unknown) => {
          if (active) setSearchError(errorMessage(err));
        },
      );
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [term]);

  const shown = term ? (matches ?? []) : (customers ?? []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Customers</h1>
        <Link
          to={carryBarcode('/customers/new')}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          New customer
        </Link>
      </div>

      {racketBarcode && (
        <p className="rounded-lg bg-amber-100 px-4 py-2 text-sm text-amber-800">
          Who owns racket <span className="font-mono font-medium">{racketBarcode}</span>? Pick the customer
          (or create one) and the racket will be added with this barcode.
        </p>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search name, phone, or email…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {(error ?? searchError) && <p className="text-sm text-red-600">{error ?? searchError}</p>}
      {customers === null && !error && <Spinner label="Loading…" />}
      {customers && customers.length === 0 && (
        <EmptyState title="No customers yet" message="Add a customer to track their purchases." />
      )}
      {customers && customers.length > 0 && matches !== null && matches.length === 0 && (
        <EmptyState title="No matches" message="No customers match your search." />
      )}
      {matches !== null && matches.length === SEARCH_RESULT_LIMIT && (
        <p className="text-sm text-slate-500">
          Showing the first {SEARCH_RESULT_LIMIT} matches. Type more to narrow it down.
        </p>
      )}
      {shown.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {shown.map((customer) => (
            <li key={customer.id}>
              <Link to={carryBarcode(`/customers/${customer.id}`)} className="block p-4 hover:bg-slate-50">
                <p className="font-medium text-slate-900">{customerName(customer)}</p>
                <p className="text-sm text-slate-500">
                  {[customer.phone_number, customer.email].filter(Boolean).join(' · ') || '—'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
