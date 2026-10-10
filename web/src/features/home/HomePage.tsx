import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { searchCustomers } from '../../lib/customerSearch';
import { errorMessage } from '../../lib/errors';
import { looksLikeBarcode, normalizeBarcode } from '../../lib/barcode';
import type { Customer } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { useHeldSale } from '../../lib/heldSale';
import { useAuth } from '../../auth/AuthContext';
import { resolveBarcode, routeForMatch, type ScannedProduct } from '../scan/resolveBarcode';
import { useScannerCapture } from '../scan/useScannerCapture';
import { ScanFlowParams, sellProductPath, withParams } from '../scan/scanFlow';

type UpcResult =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'product'; product: ScannedProduct }
  | { kind: 'notFoundUpc'; upc: string }
  | { kind: 'error'; message: string };

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const heldSale = useHeldSale();
  const heldCount = heldSale?.lines.reduce((n, l) => n + l.qty, 0) ?? 0;
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Customer[]>([]);
  const [searchingNames, setSearchingNames] = useState(false);
  const [upcResult, setUpcResult] = useState<UpcResult>({ kind: 'idle' });
  const searchRef = useRef<HTMLInputElement>(null);

  const term = query.trim();
  const isUpcQuery = looksLikeBarcode(term);
  const isNameQuery = term.length > 0 && !isUpcQuery;

  // A hardware scanner fired while focus was elsewhere on the page (e.g. after
  // clicking a nav card): treat it exactly like typing the code and pressing Enter.
  useScannerCapture((code) => {
    setQuery(code);
    void runUpc(code);
  }, searchRef);

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
      let found: Customer[] = [];
      try {
        found = await searchCustomers(term);
      } catch {
        // A failed lookup just shows no matches; the user can retype.
      }
      if (!active) return;
      setMatches(found);
      setSearchingNames(false);
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [term, isNameQuery]);

  // A barcode may belong to a product, a customer's racket, or a gift card —
  // `resolve_barcode` decides, and `routeForMatch` knows where each one lives.
  // A product stays on this screen so the cashier can choose sell vs. view.
  async function runUpc(raw: string) {
    const upc = normalizeBarcode(raw);
    setUpcResult({ kind: 'searching' });
    try {
      const match = await resolveBarcode(upc);
      if (match.kind === 'product') {
        // A racket (serialized) scanned here means "receive into inventory":
        // go straight to its receive sheet. Others show the sell/view card.
        if (match.product.is_serialized) {
          navigate(`/products/${match.product.id}?receive=1`);
          return;
        }
        setUpcResult({ kind: 'product', product: match.product });
        return;
      }
      const route = routeForMatch(match);
      if (route) {
        navigate(route);
        return;
      }
      setUpcResult({ kind: 'notFoundUpc', upc });
    } catch (err) {
      setUpcResult({ kind: 'error', message: errorMessage(err) });
    }
  }

  const createCustomerUrl = `/customers/new?name=${encodeURIComponent(term)}`;

  function onSubmit() {
    if (!term) return;
    if (isUpcQuery) {
      void runUpc(term);
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
      {heldSale && (
        <button
          onClick={() => navigate('/sales/new')}
          className="flex items-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-200"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" />
          Return to sale in progress{heldCount > 0 ? ` · ${heldCount} item${heldCount === 1 ? '' : 's'}` : ''}
        </button>
      )}

      <div className="space-y-2">
        <h1 className="text-xl font-bold text-slate-900">AceStock</h1>
        <p className="text-sm text-slate-600">
          Scan or type a UPC to find an item, or type a name to find a customer.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          ref={searchRef}
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
      {isUpcQuery && upcResult.kind === 'searching' && (
        <p className="text-sm text-slate-500">Searching…</p>
      )}
      {upcResult.kind === 'error' && <p className="text-sm text-red-600">{upcResult.message}</p>}
      {upcResult.kind === 'product' && (
        <FoundProductCard product={upcResult.product} hasHeldSale={Boolean(heldSale)} />
      )}
      {upcResult.kind === 'notFoundUpc' && <NotFoundChooser code={upcResult.upc} />}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <NavCard to="/products" label="Products" />
        <NavCard to="/customers" label="Customers" />
        <NavCard to="/gift-cards" label="Gift Cards" />
        <NavCard to="/string-jobs/open" label="Open Re-Strings" />
        <NavCard to="/string-jobs/completed" label="Completed Re-Strings" />
      </div>

      {user?.email && (
        <p className="pt-2 text-xs text-slate-400">Signed in as {user.email}</p>
      )}
    </div>
  );
}

// MARK: - Found product

/**
 * A scanned inventory item. Selling is the common case at the counter, so it
 * is the primary action; viewing the product (stock, details) is secondary.
 */
function FoundProductCard({ product, hasHeldSale }: { product: ScannedProduct; hasHeldSale: boolean }) {
  const navigate = useNavigate();
  const title = [product.brand, product.name].filter(Boolean).join(' ');
  const attributeSummary = Object.values(product.attributes ?? {})
    .filter((v) => v != null && v !== '')
    .map(String)
    .join(' · ');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{title}</p>
          {attributeSummary && <p className="text-sm text-slate-500">{attributeSummary}</p>}
        </div>
        {product.sell_price != null && (
          <p className="shrink-0 text-lg font-semibold text-slate-900">${product.sell_price.toFixed(2)}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => navigate(sellProductPath(product.id))}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {hasHeldSale ? 'Add to sale in progress' : 'Sell — start a ticket'}
        </button>
        <button
          onClick={() => navigate(`/products/${product.id}`)}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          View product
        </button>
      </div>
    </div>
  );
}

// MARK: - Not-found chooser

/**
 * An unknown code can become one of three things. Each choice hands the code
 * to the right screen with it prefilled so nothing has to be re-scanned.
 */
function NotFoundChooser({ code }: { code: string }) {
  const navigate = useNavigate();
  const choices: { label: string; hint: string; to: string; primary?: boolean }[] = [
    {
      label: 'Create product',
      hint: 'New inventory item with this UPC',
      to: withParams('/products/new', { upc: code }),
      primary: true,
    },
    {
      label: "Assign to a customer's racket",
      hint: 'Pick the owner, then the racket is added with this barcode',
      to: withParams('/customers', { [ScanFlowParams.racketBarcode]: code }),
    },
    {
      label: 'Sell as a gift card',
      hint: 'Open a sale with this code as a new gift card',
      to: withParams('/sales/new', { [ScanFlowParams.giftCardCode]: code }),
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-sm text-slate-700">
        Nothing matches <span className="font-mono font-medium">{code}</span>. What is it?
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        {choices.map((choice) => (
          <button
            key={choice.label}
            onClick={() => navigate(choice.to)}
            className={
              choice.primary
                ? 'rounded-lg bg-blue-600 p-3 text-left text-white hover:bg-blue-700'
                : 'rounded-lg border border-slate-300 p-3 text-left text-slate-800 hover:bg-slate-50'
            }
          >
            <span className="block text-sm font-semibold">{choice.label}</span>
            <span className={`block text-xs ${choice.primary ? 'text-blue-100' : 'text-slate-500'}`}>
              {choice.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

// MARK: - Nav card

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
