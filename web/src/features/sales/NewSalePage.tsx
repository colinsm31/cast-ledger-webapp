import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Customer, JsonValue, PaymentMethod } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { clearHeldSale, getHeldSale, setHeldSale } from '../../lib/heldSale';

interface ScannedProduct {
  id: string;
  brand: string | null;
  name: string;
  attributes: Record<string, JsonValue> | null;
  sell_price: number | null;
}

interface CartLine {
  key: string;
  productId?: string;
  stringJobId?: string;
  label: string;
  price: string; // editable
  qty: number;
}

function productLabel(p: ScannedProduct): string {
  const attrs = Object.values(p.attributes ?? {})
    .filter((v) => v != null && v !== '')
    .map(String);
  return [p.brand, p.name, ...attrs].filter(Boolean).join(' ');
}

export function NewSalePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  // The string job this ticket settles, if any (drives deliver-on-pay). Held
  // across leave/resume alongside the cart.
  const [jobCtx, setJobCtx] = useState<{ id: string; deliver: boolean } | null>(null);
  const [restored, setRestored] = useState(false);
  const [scan, setScan] = useState('');
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [choosingPayment, setChoosingPayment] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const focusScan = () => scanRef.current?.focus();
  useEffect(() => {
    focusScan();
  }, []);

  // On open: prefill from a string job (URL params), else resume a held ticket.
  useEffect(() => {
    const urlJob = searchParams.get('stringJob');
    const urlDeliver = searchParams.get('deliver') === '1';
    if (urlJob) {
      setJobCtx({ id: urlJob, deliver: urlDeliver });
      void (async () => {
        const { data, error: err } = await supabase
          .from('string_jobs')
          .select('id, price, customer_rackets ( brand, model, customers ( * ) )')
          .eq('id', urlJob)
          .single();
        if (!err && data) {
          const job = data as unknown as {
            price: number | null;
            customer_rackets: { brand: string | null; model: string; customers: Customer | null } | null;
          };
          const racket = job.customer_rackets;
          if (racket?.customers) setCustomer(racket.customers);
          const label = `Stringing — ${racket?.brand ? `${racket.brand} ` : ''}${racket?.model ?? ''}`.trim();
          const price = String(job.price ?? 0);
          setLines((prev) =>
            prev.some((l) => l.key === `job:${urlJob}`)
              ? prev
              : [{ key: `job:${urlJob}`, stringJobId: urlJob, label, price, qty: 1 }, ...prev],
          );
        }
        setRestored(true);
      })();
    } else {
      const held = getHeldSale();
      if (held) {
        setLines(held.lines as CartLine[]);
        setCustomer(held.customer);
        setJobCtx(held.stringJobId ? { id: held.stringJobId, deliver: held.deliverAfter } : null);
      }
      setRestored(true);
    }
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the ticket as it changes (after the initial restore so we don't
  // clobber a saved ticket with the empty initial state).
  useEffect(() => {
    if (!restored) return;
    setHeldSale(
      lines.length > 0
        ? { lines, customer, stringJobId: jobCtx?.id ?? null, deliverAfter: jobCtx?.deliver ?? false }
        : null,
    );
  }, [restored, lines, customer, jobCtx]);

  async function addByBarcode(raw: string) {
    const code = raw.replace(/\s+/g, '').trim();
    setScanMsg(null);
    if (!code) return;
    const { data, error: err } = await supabase
      .from('products')
      .select('id, brand, name, attributes, sell_price')
      .eq('barcode', code)
      .maybeSingle();
    if (err) {
      setScanMsg(errorMessage(err));
      return;
    }
    if (!data) {
      setScanMsg(`No product found for UPC ${code}.`);
      return;
    }
    addProduct(data as ScannedProduct);
    focusScan();
  }

  function handleScan() {
    const raw = scan;
    setScan('');
    void addByBarcode(raw);
  }

  // Capture hardware-scanner input anywhere on this screen (scanner types fast
  // then sends Enter). Buffer global keystrokes unless typing in a field.
  const scanHandlerRef = useRef<(code: string) => void>(() => {});
  scanHandlerRef.current = (code) => void addByBarcode(code);
  useEffect(() => {
    const buffer = { text: '', last: 0 };
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target === scanRef.current) return;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      const now = Date.now();
      if (now - buffer.last > 100) buffer.text = '';
      buffer.last = now;
      if (e.key === 'Enter') {
        const code = buffer.text;
        buffer.text = '';
        if (code) {
          e.preventDefault();
          scanHandlerRef.current(code);
        }
        return;
      }
      if (e.key.length === 1) buffer.text += e.key;
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function addProduct(p: ScannedProduct) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        { key: p.id, productId: p.id, label: productLabel(p), price: String(p.sell_price ?? 0), qty: 1 },
      ];
    });
  }

  function setQty(key: string, qty: number) {
    if (qty <= 0) {
      setLines((prev) => prev.filter((l) => l.key !== key));
      return;
    }
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty } : l)));
  }

  function setPrice(key: string, price: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, price } : l)));
  }

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * (Number(l.price) || 0), 0),
    [lines],
  );

  function openPayment() {
    if (lines.length === 0) {
      setError('Scan at least one item.');
      return;
    }
    for (const l of lines) {
      if (Number(l.price) < 0 || Number.isNaN(Number(l.price))) {
        setError(`Enter a valid price for ${l.label}.`);
        return;
      }
    }
    setError(null);
    setChoosingPayment(true);
  }

  function cancelSale() {
    if (lines.length > 0 && !window.confirm('Cancel this sale and discard the ticket?')) return;
    clearHeldSale();
    navigate('/');
  }

  async function completeSale(method: PaymentMethod) {
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('record_sale', {
      p_lines: lines.map((l) =>
        l.stringJobId
          ? { string_job_id: l.stringJobId, qty: l.qty, unit_price: Number(l.price) || 0 }
          : { product_id: l.productId, qty: l.qty, unit_price: Number(l.price) || 0 },
      ),
      p_customer_id: customer?.id ?? null,
      p_payment_method: method,
      p_note: null,
    });
    if (err) {
      setSaving(false);
      setError(errorMessage(err));
      return;
    }
    // Paying at pickup: deliver the racket now that it's paid.
    if (jobCtx?.deliver && jobCtx.id) {
      const { error: advErr } = await supabase.rpc('advance_string_job', {
        p_job_id: jobCtx.id,
        p_target_status: 'delivered',
      });
      if (advErr) {
        setSaving(false);
        setError(errorMessage(advErr));
        return;
      }
    }
    clearHeldSale();
    setSaving(false);
    navigate(`/sales/${data as string}`);
  }

  if (choosingPayment) {
    return (
      <PaymentScreen
        total={subtotal}
        busy={saving}
        error={error}
        onBack={() => setChoosingPayment(false)}
        onPick={(m) => void completeSale(m)}
      />
    );
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">New sale</h1>
        <button onClick={() => navigate('/sales')} className="text-sm text-blue-600 hover:underline">
          Sales history
        </button>
      </div>

      <CustomerBar customer={customer} onChange={setCustomer} />

      {/* Scan */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <div className="flex gap-2">
          <input
            ref={scanRef}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleScan();
            }}
            placeholder="Scan a UPC…"
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleScan}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Add item
          </button>
        </div>
        {scanMsg && <p className="text-sm text-red-600">{scanMsg}</p>}
      </section>

      {/* Cart */}
      <section className="rounded-xl border border-slate-200 bg-white">
        {lines.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">Scan an item to add it to the ticket.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {lines.map((l) => (
              <li key={l.key} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{l.label}</p>
                  <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                    <span>$</span>
                    <input
                      value={l.price}
                      onChange={(e) => setPrice(l.key, e.target.value)}
                      inputMode="decimal"
                      className="w-20 rounded border border-slate-300 px-2 py-0.5 text-sm"
                    />
                    <span className="ml-1">each</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setQty(l.key, l.qty - 1)}
                    className="h-7 w-7 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-medium">{l.qty}</span>
                  <button
                    onClick={() => setQty(l.key, l.qty + 1)}
                    className="h-7 w-7 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                  >
                    +
                  </button>
                </div>
                <div className="w-20 text-right text-sm font-semibold text-slate-900">
                  ${(l.qty * (Number(l.price) || 0)).toFixed(2)}
                </div>
                <button onClick={() => setQty(l.key, 0)} className="text-xs text-red-600 hover:underline">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Total + complete */}
      <section className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
        <span className="text-sm font-medium text-slate-500">Subtotal</span>
        <span className="text-2xl font-bold text-slate-900">${subtotal.toFixed(2)}</span>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={openPayment}
          disabled={lines.length === 0}
          className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          Payment Type · ${subtotal.toFixed(2)}
        </button>
        <button
          onClick={cancelSale}
          className="rounded-lg border border-red-300 px-4 py-3 text-base font-medium text-red-700 hover:bg-red-50"
        >
          Cancel Sale
        </button>
      </div>
    </div>
  );
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'credit', label: 'Credit' },
  { value: 'cash', label: 'Cash' },
  { value: 'gift_card', label: 'Gift Card' },
  { value: 'store_credit', label: 'Store Credit' },
];

function PaymentScreen({
  total,
  busy,
  error,
  onBack,
  onPick,
}: {
  total: number;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onPick: (method: PaymentMethod) => void;
}) {
  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <button onClick={onBack} className="text-sm text-blue-600 hover:underline" disabled={busy}>
          ‹ Back to ticket
        </button>
        <h1 className="text-xl font-bold text-slate-900">Payment</h1>
        <p className="text-sm text-slate-500">Total due</p>
        <p className="text-3xl font-bold text-slate-900">${total.toFixed(2)}</p>
      </div>

      <p className="text-sm font-medium text-slate-500">Select payment type</p>
      <div className="grid grid-cols-2 gap-3">
        {PAYMENT_METHODS.map((m) => (
          <button
            key={m.value}
            onClick={() => onPick(m.value)}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white p-6 text-lg font-semibold text-slate-900 hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
          >
            {m.label}
          </button>
        ))}
      </div>

      {busy && <p className="text-sm text-slate-500">Completing sale…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Customer bar: shows the attached customer or "Unidentified Customer", with a
// predictive name search to attach one.
function CustomerBar({
  customer,
  onChange,
}: {
  customer: Customer | null;
  onChange: (c: Customer | null) => void;
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Customer[]>([]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setMatches([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      const { data } = await supabase
        .from('customers')
        .select('*')
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%`)
        .order('last_name')
        .order('first_name')
        .limit(8);
      if (active) setMatches((data ?? []) as Customer[]);
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  if (!picking) {
    return (
      <section className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
        <div>
          <p className="text-xs font-medium text-slate-500">Customer</p>
          <p className="font-medium text-slate-900">
            {customer ? customerNameLastFirst(customer) : 'Unidentified Customer'}
          </p>
        </div>
        <div className="flex gap-2">
          {customer && (
            <button onClick={() => onChange(null)} className="text-sm text-slate-500 hover:underline">
              Clear
            </button>
          )}
          <button
            onClick={() => {
              setPicking(true);
              setQuery('');
            }}
            className="text-sm text-blue-600 hover:underline"
          >
            {customer ? 'Change' : 'Add customer'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">Attach customer</p>
        <button
          onClick={() => {
            onChange(null);
            setPicking(false);
          }}
          className="text-sm text-slate-500 hover:underline"
        >
          Sell to Unidentified
        </button>
      </div>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search customer name…"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {query.trim() && (
        <ul className="divide-y divide-slate-100">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => {
                  onChange(c);
                  setPicking(false);
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{customerNameLastFirst(c)}</span>
                <span className="text-sm text-slate-500">
                  {[c.phone_number, c.email].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-2 py-2 text-sm text-slate-500">No matches.</li>}
        </ul>
      )}
    </section>
  );
}
