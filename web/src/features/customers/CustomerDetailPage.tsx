import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Customer, JsonValue, PurchaseHistoryRow, SaleLineKind } from '../../types/domain';
import { customerName, stringingLineName } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { formatPhone } from '../../lib/phone';
import { hasSubCent, SUB_CENT_MESSAGE } from '../../lib/money';
import { Spinner } from '../../components/Spinner';
import { LoadError } from '../../components/LoadError';
import { CustomerRacketsPanel } from './CustomerRacketsPanel';
import { RestringHistoryPanel } from './RestringHistoryPanel';
import { useBack } from '../../app/BackContext';
import { ScanFlowParams } from '../scan/scanFlow';

// Filter sales by customer (top-level column), embedding each sale's lines up to
// product + category. Flattened into PurchaseHistoryRow client-side.
const HISTORY_SELECT = `
  id, sold_at,
  sale_lines (
    qty, unit_price, kind,
    products ( brand, name, attributes, categories ( name ) ),
    gift_cards ( code )
  )
`;

interface HistorySaleRaw {
  id: string;
  sold_at: string;
  sale_lines: Array<{
    qty: number;
    unit_price: number;
    kind: SaleLineKind;
    products: {
      brand: string | null;
      name: string;
      attributes: Record<string, JsonValue> | null;
      categories: { name: string } | null;
    } | null;
    gift_cards: { code: string } | null;
  }> | null;
}

type CustomerTab = 'rackets' | 'restrings' | 'purchases';

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<PurchaseHistoryRow[]>([]);
  const [storeCredit, setStoreCredit] = useState(0);
  const [giftCards, setGiftCards] = useState<{ code: string; balance: number }[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  // A scanned racket barcode to register for this customer. Read once, then
  // dropped from the URL so a refresh doesn't reopen the add form.
  const [prefillRacketBarcode] = useState(() => searchParams.get(ScanFlowParams.racketBarcode));
  const [tab, setTab] = useState<CustomerTab>(prefillRacketBarcode ? 'rackets' : 'purchases');
  // A failed load of the customer itself, or a failed edit or store credit
  // save; shown at any time, and cleared when the next action starts.
  const [error, setError] = useState<string | null>(null);
  // Failed loads of the balances or purchase history, shown in their place
  // with Retry, so a failure never looks like $0 or "no purchases" (#23).
  const [balancesError, setBalancesError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const startRequest = useLatestRequest();
  useBack('/customers');

  useEffect(() => {
    if (!searchParams.has(ScanFlowParams.racketBarcode)) return;
    const next = new URLSearchParams(searchParams);
    next.delete(ScanFlowParams.racketBarcode);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    if (!customerId) return;
    // Moving to another customer, answers for the previous one are ignored (#37).
    const isLatest = startRequest();
    const custRes = await supabase.from('customers').select('*').eq('id', customerId).single();
    if (!isLatest()) return;
    if (custRes.error) {
      setError(errorMessage(custRes.error));
      return;
    }
    setCustomer(custRes.data as Customer);

    // Account balances: store credit + this customer's gift cards.
    const [scRes, gcRes] = await Promise.all([
      supabase.from('customer_store_credit').select('balance').eq('customer_id', customerId).maybeSingle(),
      supabase.from('gift_card_balance').select('code, balance').eq('customer_id', customerId),
    ]);
    if (!isLatest()) return;
    const balancesLoadError = scRes.error ?? gcRes.error;
    setBalancesError(balancesLoadError ? `Couldn't load the balances: ${errorMessage(balancesLoadError)}` : null);
    setStoreCredit(scRes.data ? Number((scRes.data as { balance: number }).balance) : 0);
    setGiftCards(
      ((gcRes.data ?? []) as { code: string; balance: number }[]).map((g) => ({
        code: g.code,
        balance: Number(g.balance),
      })),
    );

    // Purchase history: this customer's sales, each with its lines → product.
    const histRes = await supabase
      .from('sales')
      .select(HISTORY_SELECT)
      .eq('customer_id', customerId)
      .order('sold_at', { ascending: false });
    if (!isLatest()) return;
    setHistoryError(histRes.error ? `Couldn't load the purchase history: ${errorMessage(histRes.error)}` : null);
    if (!histRes.error && histRes.data) {
      const rows: PurchaseHistoryRow[] = [];
      for (const sale of histRes.data as unknown as HistorySaleRaw[]) {
        for (const line of sale.sale_lines ?? []) {
          const label = line.products
            ? { category: line.products.categories?.name ?? '—', brand: line.products.brand, name: line.products.name, attributes: line.products.attributes ?? {} }
            : line.gift_cards
              ? { category: 'Gift card', brand: null, name: `Gift card ${line.gift_cards.code}`, attributes: {} }
              : { category: 'Stringing', brand: null, name: stringingLineName(line.kind), attributes: {} };
          rows.push({
            sale_id: sale.id,
            sold_at: sale.sold_at,
            qty: line.qty,
            unit_price: line.unit_price,
            category: label.category,
            brand: label.brand,
            product_name: label.name,
            attributes: label.attributes,
          });
        }
      }
      setHistory(rows);
    }
  }, [customerId, startRequest]);

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

      {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

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

      {balancesError ? (
        <LoadError message={balancesError} onRetry={() => void load()} />
      ) : (
        <AccountPanel
          customerId={customer.id}
          storeCredit={storeCredit}
          giftCards={giftCards}
          onChanged={load}
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

      {tab === 'rackets' && (
        <CustomerRacketsPanel customerId={customer.id} prefillBarcode={prefillRacketBarcode ?? undefined} />
      )}

      {tab === 'restrings' && <RestringHistoryPanel customerId={customer.id} />}

      {tab === 'purchases' && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Past purchases</h2>
            {history.length > 0 && !historyError && (
              <span className="text-sm text-slate-500">Total ${totalSpent.toFixed(2)}</span>
            )}
          </div>
          {historyError ? (
            <LoadError message={historyError} onRetry={() => void load()} />
          ) : history.length === 0 ? (
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

// MARK: - Account (store credit + gift cards)

function AccountPanel({
  customerId,
  storeCredit,
  giftCards,
  onChanged,
  onError,
}: {
  customerId: string;
  storeCredit: number;
  giftCards: { code: string; balance: number }[];
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const amountHasSubCent = hasSubCent(amount);
  const canAdd = Number(amount) > 0 && !amountHasSubCent && reason.trim() !== '';

  async function addCredit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      onError('Enter a positive store credit amount.');
      return;
    }
    if (!canAdd) return;
    onError(null);
    setSaving(true);
    const { error: err } = await supabase.rpc('add_store_credit', {
      p_customer_id: customerId,
      p_amount: amt,
      p_reason: reason.trim() || null,
    });
    setSaving(false);
    if (err) {
      onError(errorMessage(err));
      return;
    }
    setAdding(false);
    setAmount('');
    setReason('');
    await onChanged();
  }

  const activeCards = giftCards.filter((g) => g.balance > 0);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-700">Store credit</h2>
          <p className="text-lg font-bold text-slate-900">${storeCredit.toFixed(2)}</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Add store credit
          </button>
        )}
      </div>

      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
          <label className="w-28 space-y-1">
            <span className="text-xs font-medium text-slate-500">Amount</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <label className="flex-1 min-w-[8rem] space-y-1">
            <span className="text-xs font-medium text-slate-500">Reason</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </label>
          <button onClick={() => void addCredit()} disabled={saving || !canAdd} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button onClick={() => setAdding(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
            Cancel
          </button>
          {amountHasSubCent && <p className="w-full text-xs text-red-600">{SUB_CENT_MESSAGE}.</p>}
        </div>
      )}

      {activeCards.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase text-slate-500">Gift cards</h3>
          <ul className="mt-1 divide-y divide-slate-100">
            {activeCards.map((g) => (
              <li key={g.code} className="flex justify-between py-1.5 text-sm">
                <span className="text-slate-700">{g.code}</span>
                <span className="font-medium text-slate-900">${g.balance.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
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
  onError: (message: string | null) => void;
}) {
  const [firstName, setFirstName] = useState(customer.first_name);
  const [lastName, setLastName] = useState(customer.last_name ?? '');
  // The saved number as stored; it's only reformatted if it's edited.
  const [phone, setPhone] = useState(customer.phone_number ?? '');
  const [email, setEmail] = useState(customer.email ?? '');
  const [saving, setSaving] = useState(false);

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  async function save() {
    if (!firstName.trim() || !lastName.trim()) {
      onError('First and last name are required');
      return;
    }
    onError(null);
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
