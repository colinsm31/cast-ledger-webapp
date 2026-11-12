import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { Customer } from '../../types/domain';
import { customerName, customerNameLastFirst } from '../../types/domain';
import { errorMessage } from '../../lib/errors';
import { searchCustomers } from '../../lib/customerSearch';
import { createCustomer, newCustomerFormFrom, newCustomerRow, type NewCustomerForm } from '../../lib/newCustomer';
import { formatPhone } from '../../lib/phone';
import { clearHeldSale, getHeldSale, setHeldSale } from '../../lib/heldSale';
import { useSettings } from '../../lib/settings';
import { LoadError } from '../../components/LoadError';
import { computeSaleTotals, fromCents, lineTotalCents, toCents } from '../../lib/saleMath';
import {
  fetchSaleQuote,
  isTotalMismatchError,
  quoteChangeNotice,
  quoteProblemMessages,
  saleQuoteArgs,
  type SaleQuote,
  type SaleQuoteOptions,
} from '../../lib/saleQuote';
import {
  applyDiscounts,
  describeDiscount,
  discountProblems,
  discountValue,
  DISCOUNT_REASON_LOOKUP_KIND,
  isApprovalProblem,
} from '../../lib/discounts';
import {
  applyServerListPrices,
  isPriceChanged,
  isPriceReasonError,
  missingPriceReasons,
  PRICE_REASON_LOOKUP_KIND,
} from '../../lib/priceOverride';
import { hasSubCent, SUB_CENT_MESSAGE } from '../../lib/money';
import { PickOrAdd } from '../lookups/PickOrAdd';
import { saleMethodsFor } from '../../lib/paymentMethods';
import { useDialog } from '../../components/Dialog';
import { useAuth } from '../../auth/AuthContext';
import { resolveBarcode, type ScannedProduct } from '../scan/resolveBarcode';
import { useScannerCapture } from '../scan/useScannerCapture';
import { ScanFlowParams, withParams } from '../scan/scanFlow';
import { PaymentScreen, type Tender } from './PaymentScreen';
import { DiscountApprovalDialog } from './DiscountApprovalDialog';
import { ProductFinder, QuickPicks } from './ProductFinder';
import { taxExemptLabel, taxRateFor } from '../../lib/taxExempt';
import type { SaleDeliveryWarning } from './SaleDetailPage';
import { decideJobLine, ownerWarnings, type TicketJob } from './ticketJobs';
import { fetchTicketJob, fetchUnpaidOpenJobs } from './ticketJobQueries';

const NEW_SALE_PATH = '/sales/new';

interface CartLine {
  key: string;
  productId?: string;
  // For a serialized product line: the specific physical unit being sold.
  productUnitId?: string;
  serialized?: boolean;
  stringJobId?: string;
  // For a stringing line: whose racquet it is (may differ from the ticket's customer).
  racketLabel?: string;
  ownerCustomerId?: string;
  ownerName?: string;
  giftCardId?: string;
  label: string;
  price: string; // editable
  // The price the line was added at (see OverridableLine in lib/priceOverride),
  // and why the price was changed from it.
  listPrice?: number | null;
  priceReason?: string;
  // The line's discount box (see lib/discounts) and why it was given.
  discount?: string;
  discountReason?: string;
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
  const { user, isAdmin } = useAuth();
  const { settings, error: settingsError, reload: reloadSettings } = useSettings();
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
  // The server's quote the payment screen charges, and why it differs from the
  // ticket if it does. Bumping paymentKey restarts the payment screen.
  const [quote, setQuote] = useState<SaleQuote | null>(null);
  const [quoteNotice, setQuoteNotice] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [paymentKey, setPaymentKey] = useState(0);
  // Catalog prices that changed while the ticket was open.
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
  // The whole ticket's discount box and reason, as typed.
  const [ticketDiscount, setTicketDiscount] = useState('');
  const [ticketDiscountReason, setTicketDiscountReason] = useState('');
  // Lines whose discount box is open, and whether the ticket's is.
  const [discountOpenKeys, setDiscountOpenKeys] = useState<Set<string>>(() => new Set());
  const [ticketDiscountOpen, setTicketDiscountOpen] = useState(false);
  // Discounts over the staff limit: the percent an admin must approve (the
  // button shows while set), the dialog, and the approval once given.
  const [approvalPercent, setApprovalPercent] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [gcForm, setGcForm] = useState(false);
  const [gcCode, setGcCode] = useState('');
  const [gcAmount, setGcAmount] = useState('');
  // A load being added; the ref stops a fast double-click adding it twice.
  const [gcBusy, setGcBusy] = useState(false);
  const gcBusyRef = useRef(false);
  // The ticket customer's unpaid open string jobs, offered as one-tap lines.
  const [customerJobs, setCustomerJobs] = useState<TicketJob[]>([]);
  const scanRef = useRef<HTMLInputElement>(null);

  const focusScan = () => scanRef.current?.focus();
  useEffect(() => {
    focusScan();
  }, []);

  // Resume the ticket saved when the register was last left. Returns what was
  // restored so callers can add to it straight away.
  function restoreHeldSale(): { lines: CartLine[]; customer: Customer | null } {
    const held = getHeldSale(user?.id);
    const heldLines = (held?.lines ?? []) as CartLine[];
    const heldCustomer = held?.customer ?? null;
    setLines(heldLines);
    setCustomer(heldCustomer);
    setJobCtx(held?.stringJobId ? { id: held.stringJobId, deliver: held.deliverAfter } : null);
    setTicketDiscount(held?.ticketDiscount ?? '');
    setTicketDiscountReason(held?.ticketDiscountReason ?? '');
    setTicketDiscountOpen(Boolean(held?.ticketDiscount));
    setDiscountOpenKeys(new Set(heldLines.filter((line) => line.discount).map((line) => line.key)));
    setRestored(true);
    return { lines: heldLines, customer: heldCustomer };
  }

  // Put a racquet's string job on the ticket (see decideJobLine for the rules).
  // Returns false, with a message, when it can't be added.
  function addJobLine(job: TicketJob, ticketCustomer: Customer | null, ticketLines: CartLine[]): boolean {
    const decision = decideJobLine(job, ticketCustomer, ticketLines.some((l) => l.stringJobId === job.id));
    if (decision.kind === 'refuse') {
      setScanMsg(decision.message);
      return false;
    }
    if (decision.customerToSet) setCustomer(decision.customerToSet);
    const line: CartLine = {
      key: `job:${job.id}`,
      stringJobId: job.id,
      label: `Stringing — ${job.racketLabel}`,
      price: String(job.price ?? 0),
      listPrice: job.price ?? null,
      qty: 1,
      racketLabel: job.racketLabel,
      ownerCustomerId: job.owner?.id,
      ownerName: job.owner ? customerName(job.owner) : undefined,
    };
    setLines((prev) => (prev.some((l) => l.key === line.key) ? prev : [...prev, line]));
    return true;
  }

  // On open: resume a held ticket, then add a string job from the URL ("Mark as
  // paid", "Take payment & deliver") to it. A scanned code the home screen
  // couldn't place can arrive as a new gift card to sell — open that form with
  // the code already filled in.
  useEffect(() => {
    const urlJob = searchParams.get('stringJob');
    const urlDeliver = searchParams.get('deliver') === '1';
    const urlGiftCardCode = searchParams.get(ScanFlowParams.giftCardCode);
    if (urlGiftCardCode) {
      setGcCode(urlGiftCardCode);
      setGcForm(true);
    }
    const held = restoreHeldSale();
    if (urlJob) {
      void (async () => {
        try {
          const job = await fetchTicketJob(urlJob);
          if (addJobLine(job, held.customer, held.lines) && urlDeliver) {
            setJobCtx({ id: urlJob, deliver: true });
          }
        } catch (err) {
          setScanMsg(errorMessage(err));
        }
        // Handled: a refresh shouldn't add it again.
        const next = new URLSearchParams(searchParams);
        next.delete('stringJob');
        next.delete('deliver');
        setSearchParams(next, { replace: true });
      })();
    }
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Offer the ticket customer's unpaid string jobs.
  useEffect(() => {
    if (!customer) {
      setCustomerJobs([]);
      return;
    }
    let active = true;
    fetchUnpaidOpenJobs(customer.id)
      .then((jobs) => {
        if (active) setCustomerJobs(jobs);
      })
      .catch(() => {
        // Only a convenience; staff can still scan the racquet's tag.
        if (active) setCustomerJobs([]);
      });
    return () => {
      active = false;
    };
  }, [customer]);

  // Persist the ticket as it changes (after the initial restore so we don't
  // clobber a saved ticket with the empty initial state).
  useEffect(() => {
    if (!restored || !user) return;
    setHeldSale(
      user.id,
      lines.length > 0
        ? {
            userId: user.id,
            lines,
            customer,
            stringJobId: jobCtx?.id ?? null,
            deliverAfter: jobCtx?.deliver ?? false,
            ticketDiscount,
            ticketDiscountReason,
          }
        : null,
    );
  }, [restored, lines, customer, jobCtx, user, ticketDiscount, ticketDiscountReason]);

  // A changed ticket needs checking again before an admin approves it.
  useEffect(() => {
    setApprovalPercent(null);
  }, [lines, ticketDiscount, customer]);

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
          // A racquet tag adds its open, unpaid string job to the ticket.
          if (!match.openJobId) {
            setScanMsg(`${match.code} is a customer's racquet with no open string job.`);
            return;
          }
          addJobLine(await fetchTicketJob(match.openJobId), customer, lines);
          focusScan();
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

  // A product found by name or a quick pick: added like a scan, then back to scanning.
  function pickProduct(p: ScannedProduct) {
    setScanMsg(null);
    addProduct(p);
    focusScan();
  }

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
        {
          key: p.id,
          productId: p.id,
          label: productLabel(p),
          price: String(p.sell_price ?? 0),
          listPrice: p.sell_price ?? null,
          qty: 1,
        },
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
          listPrice: u.product.sell_price ?? null,
          qty: 1,
        },
      ];
    });
  }

  async function addGiftCardLine() {
    if (gcBusyRef.current) return;
    gcBusyRef.current = true;
    setGcBusy(true);
    try {
      await addGiftCardLineNow();
    } finally {
      gcBusyRef.current = false;
      setGcBusy(false);
    }
  }

  // Sell a gift card: ensure a card exists for the code, then add a load line.
  async function addGiftCardLineNow() {
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
    if (hasSubCent(gcAmount)) {
      setScanMsg(`Load amount: ${SUB_CENT_MESSAGE.toLowerCase()}.`);
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
      {
        key: `gc:${gcId}:${crypto.randomUUID()}`,
        giftCardId: gcId,
        label: `Gift card ${code}`,
        price: String(amt),
        listPrice: null,
        qty: 1,
      },
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

  function updateLine(key: string, changes: Partial<CartLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  }

  function toggleLineDiscount(key: string) {
    const open = discountOpenKeys.has(key);
    setDiscountOpenKeys((prev) => {
      const next = new Set(prev);
      if (open) next.delete(key);
      else next.add(key);
      return next;
    });
    // Closing the box takes the discount off.
    if (open) updateLine(key, { discount: '', discountReason: '' });
  }

  function toggleTicketDiscount() {
    if (ticketDiscountOpen) {
      setTicketDiscount('');
      setTicketDiscountReason('');
    }
    setTicketDiscountOpen((open) => !open);
  }

  // What quote_sale and record_sale take besides the lines and customer.
  function quoteOptions(approval: string | null = approvalId): SaleQuoteOptions {
    return { ticket: { discount: ticketDiscount, discountReason: ticketDiscountReason }, approvalId: approval };
  }

  // Tax: products always taxed; stringing optionally; gift-card loads never;
  // nothing for a tax-exempt customer.
  const taxRate = taxRateFor(settings?.tax_rate ?? 0, customer);
  const taxStringing = settings?.tax_stringing ?? false;
  // Discounts come off each item first (see lib/discounts); totals and tax
  // are worked out on what each item finally costs.
  const discounted = useMemo(() => applyDiscounts(lines, ticketDiscount), [lines, ticketDiscount]);
  const { subtotal, tax, total } = useMemo(
    () =>
      computeSaleTotals(
        lines.map((line, index) => ({ ...line, price: discounted.lines[index].price })),
        { taxRate, taxStringing },
      ),
    [lines, discounted, taxRate, taxStringing],
  );

  async function openPayment(approval: string | null = approvalId) {
    // Without the settings the tax, and so the total, isn't known.
    if (!settings) {
      setError(settingsError ?? 'The shop settings are still loading.');
      return;
    }
    if (lines.length === 0) {
      setError('Scan at least one item.');
      return;
    }
    for (const l of lines) {
      if (Number(l.price) < 0 || Number.isNaN(Number(l.price))) {
        setError(`Enter a valid price for ${l.label}.`);
        return;
      }
      if (hasSubCent(String(l.price))) {
        setError(`Price for ${l.label}: ${SUB_CENT_MESSAGE.toLowerCase()}.`);
        return;
      }
    }
    const missingReasons = [
      ...missingPriceReasons(lines),
      ...discountProblems(lines, { discount: ticketDiscount, discountReason: ticketDiscountReason }),
    ];
    if (missingReasons.length > 0) {
      setError(missingReasons.join('\n'));
      return;
    }
    setError(null);
    setPriceNotice(null);
    setApprovalPercent(null);
    setQuoting(true);
    let fresh: SaleQuote;
    try {
      fresh = await fetchSaleQuote(lines, customer?.id ?? null, quoteOptions(approval));
    } catch (err) {
      setError(`Couldn't check the total with the server: ${errorMessage(err)}`);
      return;
    } finally {
      setQuoting(false);
    }
    // Catalog prices that moved while the ticket was open: unchanged lines take
    // the new price. Stop so the cashier sees the new total, or gives a reason
    // for a line that now differs from its list price.
    const synced = applyServerListPrices(lines, fresh.listPrices);
    if (synced.changed) {
      setLines(synced.lines);
      const nowMissing = missingPriceReasons(synced.lines);
      if (synced.notices.length > 0) {
        setPriceNotice(`Prices changed in the catalog: ${synced.notices.join(' ')} Check the ticket, then press Payment Type again.`);
      }
      if (nowMissing.length > 0) setError(nowMissing.join('\n'));
      if (synced.notices.length > 0 || nowMissing.length > 0) return;
    }
    // The customer's exemption changed while the ticket was open: show the new total first.
    if (customer && fresh.taxExemptId !== (customer.tax_exempt ? customer.tax_exempt_id : null)) {
      setCustomer({ ...customer, tax_exempt: fresh.taxExemptId != null, tax_exempt_id: fresh.taxExemptId });
      setPriceNotice(
        `${customerName(customer)}'s tax exemption changed, so the tax changed. Check the ticket, then press Payment Type again.`,
      );
      return;
    }
    if (fresh.problems.length > 0) {
      setError(
        quoteProblemMessages(
          fresh.problems,
          lines.map((l) => l.label),
        ).join('\n'),
      );
      // Only the staff limit stands in the way: offer an admin's approval.
      if (!isAdmin && fresh.problems.every(isApprovalProblem)) setApprovalPercent(fresh.maxDiscountPercent);
      return;
    }
    const notice = quoteChangeNotice({ subtotal, tax, total }, taxRate, fresh);
    if (notice) reloadSettings();
    setQuote(fresh);
    setQuoteNotice(notice);
    setChoosingPayment(true);
  }

  // record_sale refused the payments because its total changed after the
  // quote: get a fresh one and start the payment again at the new amount.
  async function requote() {
    try {
      const fresh = await fetchSaleQuote(lines, customer?.id ?? null, quoteOptions());
      setQuote(fresh);
      setQuoteNotice(
        `The total changed while payment was being taken: it's now $${fresh.total.toFixed(2)}. Take payment again.`,
      );
      setPaymentKey((key) => key + 1);
      setError(null);
      reloadSettings();
    } catch (err) {
      setError(`The total changed, and the new total couldn't be checked: ${errorMessage(err)}`);
    }
  }

  function closePayment() {
    setChoosingPayment(false);
    setQuote(null);
    setQuoteNotice(null);
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
    if (user) clearHeldSale(user.id);
    navigate('/');
  }

  async function completeSale(tenders: Tender[]) {
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('record_sale', {
      ...saleQuoteArgs(lines, customer?.id ?? null, quoteOptions()),
      p_payments: tenders.map((t) => ({
        method: t.method,
        amount: t.amount,
        gift_card_id: t.giftCardId ?? null,
        check_number: t.checkNumber ?? null,
      })),
      p_note: null,
    });
    if (err) {
      setSaving(false);
      if (isTotalMismatchError(err)) {
        await requote();
        return;
      }
      if (isApprovalProblem({ line: null, message: errorMessage(err) })) {
        // The approval expired or was used elsewhere: back to the ticket to ask again.
        setApprovalId(null);
        closePayment();
        await openPayment(null);
        return;
      }
      if (isPriceReasonError(err)) {
        // A list price moved after the quote: back to the ticket to pick it up.
        closePayment();
        await openPayment();
        return;
      }
      setError(errorMessage(err));
      return;
    }
    // The sale is recorded: from here the ticket is done whatever happens, so
    // a failure below can't invite charging twice.
    if (user) clearHeldSale(user.id);
    let deliveryWarning: SaleDeliveryWarning | undefined;
    // Paying at pickup: deliver the racket now that it's paid.
    if (jobCtx?.deliver && jobCtx.id) {
      const { error: advErr } = await supabase.rpc('advance_string_job', {
        p_job_id: jobCtx.id,
        p_target_status: 'delivered',
      });
      if (advErr) deliveryWarning = { jobId: jobCtx.id, message: errorMessage(advErr) };
    }
    setSaving(false);
    navigate(`/sales/${data as string}`, { state: deliveryWarning ? { deliveryWarning } : undefined });
  }

  if (choosingPayment && quote) {
    return (
      <PaymentScreen
        key={paymentKey}
        total={quote.total}
        notice={quoteNotice}
        methods={saleMethodsFor(settings?.accept_checks ?? false)}
        customerId={customer?.id ?? null}
        busy={saving}
        error={error}
        onBack={closePayment}
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

      {!settings && settingsError && <LoadError message={settingsError} onRetry={reloadSettings} />}

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
              setFinding((v) => !v);
              setScanMsg(null);
            }}
            aria-pressed={finding}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Find by name
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
        <ProductFinder open={finding} onPick={pickProduct} productLabel={productLabel} />
        <QuickPicks onPick={pickProduct} />
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
              disabled={gcBusy}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {gcBusy ? '…' : 'Add to ticket'}
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
            {lines.map((l, index) => (
              <li key={l.key} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{l.label}</p>
                  <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                    <span>$</span>
                    <input
                      value={l.price}
                      onChange={(e) => updateLine(l.key, { price: e.target.value })}
                      inputMode="decimal"
                      className="w-20 rounded border border-slate-300 px-2 py-0.5 text-sm"
                    />
                    <span className="ml-1">each</span>
                    {isPriceChanged(l) && (
                      <span className="ml-2 text-xs text-amber-700">List ${(l.listPrice ?? 0).toFixed(2)}</span>
                    )}
                  </div>
                  {isPriceChanged(l) && (
                    <div className="mt-1 max-w-xs">
                      <PickOrAdd
                        kind={PRICE_REASON_LOOKUP_KIND}
                        value={l.priceReason ?? ''}
                        onChange={(reason) => updateLine(l.key, { priceReason: reason })}
                        placeholder="Reason for the price change"
                      />
                    </div>
                  )}
                  {!l.giftCardId && (
                    <LineDiscount
                      open={discountOpenKeys.has(l.key)}
                      discount={l.discount ?? ''}
                      reason={l.discountReason ?? ''}
                      discountedPrice={discounted.lines[index].price}
                      undiscountedPrice={String(l.price)}
                      onToggle={() => toggleLineDiscount(l.key)}
                      onDiscount={(discount) => updateLine(l.key, { discount })}
                      onReason={(reason) => updateLine(l.key, { discountReason: reason })}
                    />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {l.serialized || l.stringJobId ? (
                    // A serialized unit is a single physical item, and a string job is
                    // charged once — qty is always 1 (the server refuses anything else).
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
                  ${fromCents(lineTotalCents({ ...l, price: discounted.lines[index].price })).toFixed(2)}
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
        {lines.some((l) => !l.giftCardId) && (
          <TicketDiscount
            open={ticketDiscountOpen}
            discount={ticketDiscount}
            reason={ticketDiscountReason}
            onToggle={toggleTicketDiscount}
            onDiscount={setTicketDiscount}
            onReason={setTicketDiscountReason}
          />
        )}
        {discounted.discountCents > 0 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>Discounts</span>
            <span className="font-medium text-green-700">−${fromCents(discounted.discountCents).toFixed(2)}</span>
          </div>
        )}
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
        {taxExemptLabel(customer) && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{taxExemptLabel(customer)}</span>
            <span className="font-medium text-slate-900">No tax</span>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-slate-100 pt-1">
          <span className="text-sm font-semibold text-slate-700">Total</span>
          <span className="text-2xl font-bold text-slate-900">${total.toFixed(2)}</span>
        </div>
      </section>

      {/* The customer's other racquets waiting to be paid for */}
      {customerJobs.some((job) => !lines.some((l) => l.stringJobId === job.id)) && (
        <section className="flex flex-wrap gap-2">
          {customerJobs
            .filter((job) => !lines.some((l) => l.stringJobId === job.id))
            .map((job) => (
              <button
                key={job.id}
                onClick={() => addJobLine(job, customer, lines)}
                className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-800 hover:bg-blue-100"
              >
                Add stringing: {job.racketLabel} (${(job.price ?? 0).toFixed(2)})
              </button>
            ))}
        </section>
      )}

      {/* A family paying on one ticket: say whose racquets are on it */}
      {ownerWarnings(lines, customer).map((warning) => (
        <p key={warning} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠ {warning}
        </p>
      ))}

      {priceNotice && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          ⚠ {priceNotice}
        </p>
      )}

      {error && <p className="whitespace-pre-line text-sm text-red-600">{error}</p>}
      {discounted.error && !error && <p className="text-sm text-red-600">{discounted.error}.</p>}
      {approvalPercent != null && (
        <button
          onClick={() => setApproving(true)}
          className="rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
        >
          Ask an admin to approve {approvalPercent}% off
        </button>
      )}
      {approving && approvalPercent != null && (
        <DiscountApprovalDialog
          percent={approvalPercent}
          staffLimit={settings?.staff_discount_cap ?? null}
          onCancel={() => setApproving(false)}
          onApproved={(id) => {
            setApproving(false);
            setApprovalId(id);
            void openPayment(id);
          }}
        />
      )}

      <div className="flex gap-2">
        <button
          onClick={() => void openPayment()}
          disabled={lines.length === 0 || !settings || quoting}
          className="flex-1 rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white hover:bg-green-700 disabled:opacity-50"
        >
          {quoting ? 'Checking…' : `Payment Type · $${total.toFixed(2)}`}
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

// A line's discount: a link that opens the box, what the number means, the
// price after it, and the reason.
function LineDiscount({
  open,
  discount,
  reason,
  discountedPrice,
  undiscountedPrice,
  onToggle,
  onDiscount,
  onReason,
}: {
  open: boolean;
  discount: string;
  reason: string;
  discountedPrice: string;
  undiscountedPrice: string;
  onToggle: () => void;
  onDiscount: (discount: string) => void;
  onReason: (reason: string) => void;
}) {
  const value = discountValue(discount);
  const priceMoved = toCents(discountedPrice) !== toCents(undiscountedPrice);
  return (
    <div className="mt-1 space-y-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onToggle} className="text-xs text-blue-600 hover:underline">
          {open ? 'Remove discount' : 'Discount'}
        </button>
        {open && (
          <>
            <input
              autoFocus
              value={discount}
              onChange={(e) => onDiscount(e.target.value)}
              inputMode="decimal"
              placeholder="0.1 or 3"
              aria-label="Discount"
              className="w-20 rounded border border-slate-300 px-2 py-0.5 text-sm"
            />
            {value != null && <span className="text-xs text-green-700">{describeDiscount(value)}</span>}
          </>
        )}
        {priceMoved && <span className="text-xs text-slate-500">→ ${discountedPrice} each</span>}
      </div>
      {open && (
        <>
          <p className="text-xs text-slate-400">0.25 = 25% off · 3 = $3 off each · 1 = 100% off</p>
          {value != null && (
            <div className="max-w-xs">
              <PickOrAdd
                kind={DISCOUNT_REASON_LOOKUP_KIND}
                value={reason}
                onChange={onReason}
                placeholder="Reason for the discount"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// The whole ticket's discount, in the totals.
function TicketDiscount({
  open,
  discount,
  reason,
  onToggle,
  onDiscount,
  onReason,
}: {
  open: boolean;
  discount: string;
  reason: string;
  onToggle: () => void;
  onDiscount: (discount: string) => void;
  onReason: (reason: string) => void;
}) {
  const value = discountValue(discount);
  return (
    <div className="space-y-1 pb-1 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onToggle} className="text-xs text-blue-600 hover:underline">
          {open ? 'Remove ticket discount' : 'Discount the whole ticket'}
        </button>
        {open && (
          <>
            <input
              autoFocus
              value={discount}
              onChange={(e) => onDiscount(e.target.value)}
              inputMode="decimal"
              placeholder="0.1 or 5"
              aria-label="Ticket discount"
              className="w-20 rounded border border-slate-300 px-2 py-0.5 text-sm"
            />
            {value != null && <span className="text-xs text-green-700">{describeDiscount(value, 'the ticket')}</span>}
          </>
        )}
      </div>
      {open && (
        <>
          <p className="text-xs text-slate-400">
            0.1 = 10% off · 5 = $5 off, shared across the items by price · gift cards aren’t discounted
          </p>
          {value != null && (
            <div className="max-w-xs">
              <PickOrAdd
                kind={DISCOUNT_REASON_LOOKUP_KIND}
                value={reason}
                onChange={onReason}
                placeholder="Reason for the ticket discount"
              />
            </div>
          )}
        </>
      )}
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
  // A new customer being added from here, without leaving the ticket.
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setMatches([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      let found: Customer[] = [];
      try {
        found = await searchCustomers(term);
      } catch {
        // A failed lookup just shows no matches; the cashier can retype.
      }
      if (active) setMatches(found);
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

  if (newCustomer) {
    return (
      <InlineNewCustomer
        form={newCustomer}
        onChange={setNewCustomer}
        onCancel={() => setNewCustomer(null)}
        onCreated={(created) => {
          onChange(created);
          setNewCustomer(null);
          setPicking(false);
        }}
      />
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
      <button
        onClick={() => setNewCustomer(newCustomerFormFrom(query))}
        className="text-sm font-medium text-blue-600 hover:underline"
      >
        + New customer{query.trim() ? ` “${query.trim()}”` : ''}
      </button>
    </section>
  );
}

// A customer created at the register: the essentials only, then attached to
// the ticket. The rest (rackets, an exemption) is on their page later.
function InlineNewCustomer({
  form,
  onChange,
  onCancel,
  onCreated,
}: {
  form: NewCustomerForm;
  onChange: (form: NewCustomerForm) => void;
  onCancel: () => void;
  onCreated: (customer: Customer) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  async function save() {
    const row = newCustomerRow(form);
    if ('error' in row) {
      setError(row.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      onCreated(await createCustomer(row));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">New customer</p>
      <div className="flex gap-2">
        <input
          autoFocus
          value={form.firstName}
          onChange={(e) => onChange({ ...form, firstName: e.target.value })}
          placeholder="First name *"
          aria-label="First name"
          className={inputClass}
        />
        <input
          value={form.lastName}
          onChange={(e) => onChange({ ...form, lastName: e.target.value })}
          placeholder="Last name *"
          aria-label="Last name"
          className={inputClass}
        />
      </div>
      <div className="flex gap-2">
        <input
          value={form.phone}
          onChange={(e) => onChange({ ...form, phone: formatPhone(e.target.value) })}
          placeholder="(555)123-4567"
          aria-label="Phone number"
          inputMode="tel"
          className={inputClass}
        />
        <input
          value={form.email}
          onChange={(e) => onChange({ ...form, email: e.target.value })}
          placeholder="Email"
          aria-label="Email"
          inputMode="email"
          className={inputClass}
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Add and attach'}
        </button>
        <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm">
          Back to search
        </button>
      </div>
    </section>
  );
}
