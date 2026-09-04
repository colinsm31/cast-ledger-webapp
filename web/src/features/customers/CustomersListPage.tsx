import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Customer } from '../../types/domain';
import { customerName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { useBack } from '../../app/BackContext';
import { ScanFlowParams, withParams } from '../scan/scanFlow';

export function CustomersListPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  useBack('/');
  const [searchParams] = useSearchParams();
  // Arrived from a home-screen scan: we're picking who owns this racket, so
  // every customer link (and "New customer") carries the barcode along.
  const racketBarcode = searchParams.get(ScanFlowParams.racketBarcode);
  const carryBarcode = (path: string) => withParams(path, { [ScanFlowParams.racketBarcode]: racketBarcode });

  async function load() {
    const { data, error: err } = await supabase
      .from('customers')
      .select('*')
      .order('last_name')
      .order('first_name');
    if (err) setError(errorMessage(err));
    else setCustomers((data ?? []) as Customer[]);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    if (!customers) return [];
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter(
      (c) =>
        customerName(c).toLowerCase().includes(term) ||
        (c.phone_number?.toLowerCase().includes(term) ?? false) ||
        (c.email?.toLowerCase().includes(term) ?? false),
    );
  }, [customers, search]);

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

      {error && <p className="text-sm text-red-600">{error}</p>}
      {customers === null && !error && <Spinner label="Loading…" />}
      {customers && customers.length === 0 && (
        <EmptyState title="No customers yet" message="Add a customer to track their purchases." />
      )}
      {customers && customers.length > 0 && filtered.length === 0 && (
        <EmptyState title="No matches" message="No customers match your search." />
      )}
      {filtered.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {filtered.map((customer) => (
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
