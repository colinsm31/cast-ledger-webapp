import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Customer, JsonValue, PurchaseHistoryRow } from '../../types/domain';
import { customerName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { formatPhone } from '../../lib/phone';
import { Spinner } from '../../components/Spinner';
import { CustomerRacketsPanel } from './CustomerRacketsPanel';
import { RestringHistoryPanel } from './RestringHistoryPanel';

// Filter sales by customer (top-level column), embedding each sale's lines up to
// product + category. Flattened into PurchaseHistoryRow client-side.
const HISTORY_SELECT = `
  id, sold_at,
  sale_lines (
    qty, unit_price,
    products ( brand, name, attributes, categories ( name ) )
  )
`;

interface HistorySaleRaw {
  id: string;
  sold_at: string;
  sale_lines: Array<{
    qty: number;
    unit_price: number;
    products: {
      brand: string | null;
      name: string;
      attributes: Record<string, JsonValue> | null;
      categories: { name: string } | null;
    } | null;
  }> | null;
}

type CustomerTab = 'rackets' | 'restrings' | 'purchases';

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<PurchaseHistoryRow[]>([]);
  const [tab, setTab] = useState<CustomerTab>('purchases');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!customerId) return;
    const custRes = await supabase.from('customers').select('*').eq('id', customerId).single();
    if (custRes.error) {
      setError(errorMessage(custRes.error));
      return;
    }
    setCustomer(custRes.data as Customer);

    // Purchase history: this customer's sales, each with its lines → product.
    const histRes = await supabase
      .from('sales')
      .select(HISTORY_SELECT)
      .eq('customer_id', customerId)
      .order('sold_at', { ascending: false });
    if (!histRes.error && histRes.data) {
      const rows: PurchaseHistoryRow[] = [];
      for (const sale of histRes.data as unknown as HistorySaleRaw[]) {
        for (const line of sale.sale_lines ?? []) {
          rows.push({
            sale_id: sale.id,
            sold_at: sale.sold_at,
            qty: line.qty,
            unit_price: line.unit_price,
            category: line.products?.categories?.name ?? '—',
            brand: line.products?.brand ?? null,
            product_name: line.products?.name ?? '—',
            attributes: line.products?.attributes ?? {},
          });
        }
      }
      setHistory(rows);
    }
  }, [customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !customer) return <p className="text-sm text-red-600">{error}</p>;
  if (!customer) return <Spinner label="Loading…" />;

  const totalSpent = history.reduce((sum, r) => sum + r.qty * r.unit_price, 0);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{customerName(customer)}</h1>
          <p className="text-sm text-slate-500">
            {[customer.phone_number, customer.email].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </button>
      </div>

      {editing && (
        <EditCustomerForm
          customer={customer}
          onCancel={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await load();
          }}
          onError={setError}
        />
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <TabButton active={tab === 'rackets'} onClick={() => setTab('rackets')}>
          Rackets owned
        </TabButton>
        <TabButton active={tab === 'restrings'} onClick={() => setTab('restrings')}>
          Re-stringing history
        </TabButton>
        <TabButton active={tab === 'purchases'} onClick={() => setTab('purchases')}>
          Past purchases
        </TabButton>
      </div>

      {tab === 'rackets' && <CustomerRacketsPanel customerId={customer.id} />}

      {tab === 'restrings' && <RestringHistoryPanel customerId={customer.id} />}

      {tab === 'purchases' && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Past purchases</h2>
            {history.length > 0 && (
              <span className="text-sm text-slate-500">Total ${totalSpent.toFixed(2)}</span>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No purchases recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
              {history.map((row, i) => (
                <li key={`${row.sale_id}-${i}`} className="flex items-center justify-between p-3">
                  <div>
                    <p className="font-medium text-slate-800">
                      {row.brand ? `${row.brand} ` : ''}
                      {row.product_name}
                      {attributeSuffix(row.attributes)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {row.category} · {formatDate(row.sold_at)}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <span className="text-slate-500">×{row.qty}</span>{' '}
                    <span className="font-medium text-slate-900">${row.unit_price.toFixed(2)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-2 text-sm font-medium ${
        active
          ? 'bg-blue-600 text-white'
          : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
      }`}
    >
      {children}
    </button>
  );
}

function attributeSuffix(values: Record<string, JsonValue>): string {
  const parts = Object.values(values ?? {})
    .filter((v) => v != null && v !== '')
    .map(String);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}

// MARK: - Edit customer form

function EditCustomerForm({
  customer,
  onCancel,
  onSaved,
  onError,
}: {
  customer: Customer;
  onCancel: () => void;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [firstName, setFirstName] = useState(customer.first_name);
  const [lastName, setLastName] = useState(customer.last_name ?? '');
  const [phone, setPhone] = useState(formatPhone(customer.phone_number ?? ''));
  const [email, setEmail] = useState(customer.email ?? '');
  const [saving, setSaving] = useState(false);

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  async function save() {
    if (!firstName.trim() || !lastName.trim()) {
      onError('First and last name are required');
      return;
    }
    setSaving(true);
    const { error: err } = await supabase
      .from('customers')
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone_number: phone.trim() || null,
        email: email.trim() || null,
      })
      .eq('id', customer.id);
    setSaving(false);
    if (err) {
      onError(errorMessage(err));
      return;
    }
    await onSaved();
  }

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-slate-700">Edit customer</h2>
      <div className="flex gap-2">
        <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" className={inputClass} />
        <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" className={inputClass} />
      </div>
      <input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(555)123-4567" className={inputClass} inputMode="tel" />
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inputClass} />
      <div className="flex gap-2">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Cancel
        </button>
      </div>
    </section>
  );
}
