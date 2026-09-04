import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Customer } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { clearHeldSale, getHeldSale, setHeldSale } from '../../lib/heldSale';
import { useSettings } from '../../lib/settings';
import { useDialog } from '../../components/Dialog';
import { resolveBarcode, type ScannedProduct } from '../scan/resolveBarcode';
import { useScannerCapture } from '../scan/useScannerCapture';
import { ScanFlowParams, withParams } from '../scan/scanFlow';
import { PaymentScreen, type Tender } from './PaymentScreen';

const NEW_SALE_PATH = '/sales/new';

interface CartLine {
  key: string;
  productId?: string;
  // For a serialized product line: the specific physical unit being sold.
  productUnitId?: string;
  serialized?: boolean;
  stringJobId?: string;
  giftCardId?: string;
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
  const { confirm } = useDialog();
  const settings = useSettings();
  const [searchParams, setSearchParams] = useSearchParams();

  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  // The string job this ticket settles, if any (drives deliver-on-pay). Held
  // across leave/resume alongside the cart.
  const [jobCtx, setJobCtx] = useState<{ id: string; deliver: boolean } | null>(null);
  const [restored, setRestored] = useState(false);
  const [scan, setScan] = useState('');
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  // A scanned code that matched nothing — offered for creation as a product.
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [choosingPayment, setChoosingPayment] = useState(false);
  const [gcForm, setGcForm] = useState(false);
  const [gcCode, setGcCode] = useState('');
  const [gcAmount, setGcAmount] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);

  const focusScan = () => scanRef.current?.focus();
  useEffect(() => {
    focusScan();
  }, []);

  // On open: prefill from a string job (URL params), else resume a held ticket.
  // A scanned code the home screen couldn't place can arrive as a new gift
  // card to sell — open that form with the code already filled in.
  useEffect(() => {
    const urlJob = searchParams.get('stringJob');
    const urlDeliver = searchParams.get('deliver') === '1';
    const urlGiftCardCode = searchParams.get(ScanFlowParams.giftCardCode);
    if (urlGiftCardCode) {
      setGcCode(urlGiftCardCode);
      setGcForm(true);
    }
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

  // Arrived with a product to ring up — from a home-screen scan ("Sell this
  // item") or back from the product form after creating one. The ticket has
  // already been restored from the held sale, so this adds to it rather than
  // replacing it. The param is dropped so a refresh doesn't add it again.
  useEffect(() => {
    if (!restored) return;
    const productIdToAdd = searchParams.get(ScanFlowParams.addProduct);
    if (!productIdToAdd) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from('products')
        .select('id, brand, name, attributes, sell_price, is_serialized')
        .eq('id', productIdToAdd)
        .maybeSingle();
      if (err) setScanMsg(errorMessage(err));
      else if (data) addProduct(data as ScannedProduct);
      const next = new URLSearchParams(searchParams);
      next.delete(ScanFlowParams.addProduct);
      setSearchParams(next, { replace: true });
      focusScan();
    })();
    // addProduct is a stable function declaration; only the params matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, searchParams, setSearchParams]);

  // Arrived with a specific unit to ring up (from a unit's "Sell" link).
  useEffect(() => {
    if (!restored) return;
    const unitIdToAdd = searchParams.get(ScanFlowParams.addUnit);
    if (!unitIdToAdd) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from('product_units')
        .select('id, barcode, status, products ( id, brand, name, attributes, sell_price )')
        .eq('id', unitIdToAdd)
        .maybeSingle();
      if (err) setScanMsg(errorMessage(err));
      else if (data) {
        const row = data as unknown as {
          id: string;
          barcode: string | null;
          status: string;
          products: ScannedProduct | null;
        };
        if (row.products) {
          addUnit({
            unitId: row.id,
            code: row.barcode,
            status: row.status,
            product: { ...row.products, is_serialized: true },
          });
        }
      }
      const next = new URLSearchParams(searchParams);
      next.delete(ScanFlowParams.addUnit);
      setSearchParams(next, { replace: true });
      focusScan();
    })();
    // addUnit is a stable function declaration; only the params matter here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, searchParams, setSearchParams]);

  // Only products can be rung up from a scan; a racket or gift-card code is
  // reported so the cashier knows the scan worked but isn't a sellable item.
  async function addByBarcode(raw: string) {
    setScanMsg(null);
    setUnknownCode(null);
    try {
      const match = await resolveBarcode(raw);
      switch (match.kind) {
        case 'product':
          if (match.product.is_serialized) {
            setScanMsg(`${match.product.name} is tracked by unit — scan the racket’s own barcode to sell a specific one.`);
            return;
          }
          addProduct(match.product);
          focusScan();
          return;
        case 'unit':
          addUnit({ unitId: match.unitId, code: match.code, status: match.status, product: match.product });
          focusScan();
          return;
        case 'racket':
          setScanMsg(`${match.code} is a customer's racket, not a product.`);
          return;
        case 'gift_card':
          setScanMsg(`${match.code} is a gift card — use “Sell gift card” or redeem it at payment.`);
          return;
        default:
          if (match.code) {
            setScanMsg(`No product found for UPC ${match.code}.`);
            setUnknownCode(match.code);
          }
      }
    } catch (err) {
      setScanMsg(errorMessage(err));
    }
  }

  // Open the product form for the unknown code; it returns here with the
  // new product id and the ticket is resumed from the held sale.
  function createUnknownProduct() {
    if (!unknownCode) return;
    navigate(withParams('/products/new', { upc: unknownCode, [ScanFlowParams.returnTo]: NEW_SALE_PATH }));
  }

  function handleScan() {
    const raw = scan;
    setScan('');
    void addByBarcode(raw);
  }

  // Hardware scanner fired while focus was off the scan box.
  useScannerCapture((code) => void addByBarcode(code), scanRef);

  function addProduct(p: ScannedProduct) {
    // Serialized products are sold by scanning a specific unit, not the model.
    if (p.is_serialized) {
      setScanMsg(`${p.name} is tracked by unit — scan the racket’s own barcode to sell a specific one.`);
      return;
    }
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id && !l.serialized);
      if (existing) {
        return prev.map((l) => (l.productId === p.id && !l.serialized ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        { key: p.id, productId: p.id, label: productLabel(p), price: String(p.sell_price ?? 0), qty: 1 },
      ];
    });
  }

  // Add a specific serialized unit (racket) to the ticket. Only in-stock units,
  // one line per unit, qty locked to 1.
  function addUnit(u: { unitId: string; code: string | null; status: string; product: ScannedProduct }) {
    if (u.status !== 'in_stock') {
      setScanMsg(`That racket isn’t available to sell (status: ${u.status}).`);
      return;
    }
    setLines((prev) => {
      if (prev.some((l) => l.productUnitId === u.unitId)) {
        setScanMsg('That racket is already on the ticket.');
        return prev;
      }
      const label = `${productLabel(u.product)}${u.code ? ` · ${u.code}` : ''}`;
      return [
        ...prev,
        {
          key: `unit:${u.unitId}`,
          productId: u.product.id,
          productUnitId: u.unitId,
          serialized: true,
          label,
          price: String(u.product.sell_price ?? 0),
          qty: 1,
        },
      ];
    });
  }

  // Sell a gift card: ensure a card exists for the code, then add a load line.
  async function addGiftCardLine() {
    const code = gcCode.replace(/\s+/g, '').trim();
    const amt = Number(gcAmount);
    if (!code) {
      setScanMsg('Enter a gift card code.');
      return;
    }
    if (!amt || amt <= 0) {
      setScanMsg('Enter a load amount.');
      return;
    }
    // If the card already carries a balance, confirm this is an intentional reload.
    const { data: existing } = await supabase
      .from('gift_card_balance')
      .select('balance')
      .eq('code', code)
      .maybeSingle();
    const existingBalance = existing ? Number((existing as { balance: number }).balance) : 0;
    if (existingBalance > 0) {
      const ok = await confirm({
        title: 'Card already active',
        message: `Card ${code} already has $${existingBalance.toFixed(2)}. Add $${amt.toFixed(2)} to it?`,
        confirmLabel: 'Add to card',
      });
      if (!ok) return;
    }
    const { data, error: err } = await supabase.rpc('ensure_gift_card', {
      p_code: code,
      p_customer_id: customer?.id ?? null,
    });
    if (err) {
      setScanMsg(errorMessage(err));
      return;
    }
    const gcId = data as string;
    setLines((prev) => [
      ...prev,
      { key: `gc:${gcId}:${crypto.randomUUID()}`, giftCardId: gcId, label: `Gift card ${code}`, price: String(amt), qty: 1 },
    ]);
    setGcForm(false);
    setGcCode('');
    setGcAmount('');
    setScanMsg(null);
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

  // Tax: products always taxed; stringing optionally; gift-card loads never.
  const taxRate = settings?.tax_rate ?? 0;
  const taxStringing = settings?.tax_stringing ?? false;
  const tax = useMemo(() => {
    const taxable = lines.reduce((sum, l) => {
      const lt = l.qty * (Number(l.price) || 0);
      if (l.giftCardId) return sum;
      if (l.stringJobId) return sum + (taxStringing ? lt : 0);
      return sum + lt;
    }, 0);
    return Math.round((taxable * taxRate) / 100 * 100) / 100;
  }, [lines, taxRate, taxStringing]);
  const total = Math.round((subtotal + tax) * 100) / 100;

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

  async function cancelSale() {
    if (lines.length > 0) {
      const ok = await confirm({
        title: 'Cancel sale?',
        message: 'This will discard the current ticket.',
        confirmLabel: 'Cancel sale',
        cancelLabel: 'Keep ticket',
        tone: 'danger',
      });
      if (!ok) return;
    }
    clearHeldSale();
    navigate('/');
  }

  async function completeSale(tenders: Tender[]) {
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('record_sale', {
      p_lines: lines.map((l) => {
        const unit_price = Number(l.price) || 0;
        if (l.stringJobId) return { string_job_id: l.stringJobId, qty: l.qty, unit_price };
        if (l.giftCardId) return { gift_card_id: l.giftCardId, qty: l.qty, unit_price };
        if (l.productUnitId)
          return { product_id: l.productId, product_unit_id: l.productUnitId, qty: 1, unit_price };
        return { product_id: l.productId, qty: l.qty, unit_price };
      }),
      p_customer_id: customer?.id ?? null,
      p_payments: tenders.map((t) => ({
        method: t.method,
        amount: t.amount,
        gift_card_id: t.giftCardId ?? null,
      })),
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
        total={total}
        customerId={customer?.id ?? null}
        busy={saving}
        error={error}
        onBack={() => setChoosingPayment(false)}
        onComplete={(tenders) => void completeSale(tenders)}
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
          <button
            onClick={() => {
              setGcForm((v) => !v);
              setScanMsg(null);
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Sell gift card
          </button>
        </div>
        {gcForm && (
          <div className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-3">
            <label className="flex-1 min-w-[10rem] space-y-1">
              <span className="text-xs font-medium text-slate-500">Gift card code</span>
              <input
                autoFocus
                value={gcCode}
                onChange={(e) => setGcCode(e.target.value)}
                placeholder="Scan or type"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="w-28 space-y-1">
              <span className="text-xs font-medium text-slate-500">Amount</span>
              <input
                value={gcAmount}
                onChange={(e) => setGcAmount(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <button
              onClick={() => void addGiftCardLine()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Add to ticket
            </button>
          </div>
        )}
        {scanMsg && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-red-600">{scanMsg}</p>
            {unknownCode && (
              <button
                onClick={createUnknownProduct}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Create product with this UPC
              </button>
            )}
          </div>
        )}
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
                  {l.serialized ? (
                    // A serialized unit is a single physical item — qty is always 1.
                    <span className="w-8 text-center text-sm font-medium text-slate-400">1</span>
                  ) : (
                    <>
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
                    </>
                  )}
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

      {/* Totals */}
      <section className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>Subtotal</span>
          <span className="font-medium text-slate-900">${subtotal.toFixed(2)}</span>
        </div>
        {tax > 0 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Tax{taxRate ? ` (${taxRate}%)` : ''}</span>
            <span className="font-medium text-slate-900">${tax.toFixed(2)}</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-1">
          <span className="text-sm font-semibold text-slate-700">Total</span>
          <span className="text-2xl font-bold text-slate-900">${total.toFixed(2)}</span>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={openPayment}
          disabled={lines.length === 0}
          className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          Payment Type · ${total.toFixed(2)}
        </button>
        <button
          onClick={() => void cancelSale()}
          className="rounded-lg border border-red-300 px-4 py-3 text-base font-medium text-red-700 hover:bg-red-50"
        >
          Cancel Sale
        </button>
      </div>
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
