import { useEffect, useState } from 'react';
import { fetchQuickPicks, priceLabel, searchProducts } from '../../lib/productSearch';
import type { ScannedProduct } from '../scan/resolveBarcode';

const SEARCH_DELAY_MS = 200;

// Adding items at the register without a barcode: a name search, and the
// shop's quick-pick buttons. Picking a product adds it like a scan would.
export function ProductFinder({
  open,
  onPick,
  productLabel,
}: {
  open: boolean;
  onPick: (product: ScannedProduct) => void;
  productLabel: (product: ScannedProduct) => string;
}) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<ScannedProduct[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setMatches([]);
      setSearchError(null);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      try {
        const found = await searchProducts(term);
        if (active) {
          setMatches(found);
          setSearchError(null);
        }
      } catch {
        if (active) setSearchError("Couldn't search the products. Try again, or scan the item.");
      }
    }, SEARCH_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  if (!open) return null;
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Brand, name, color, gauge…"
        aria-label="Find an item by name"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {searchError && <p className="text-sm text-red-600">{searchError}</p>}
      {query.trim() && !searchError && (
        <ul className="divide-y divide-slate-100 rounded-lg bg-white">
          {matches.map((product) => (
            <li key={product.id}>
              <button
                onClick={() => {
                  onPick(product);
                  setQuery('');
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="font-medium text-slate-900">{productLabel(product)}</span>
                <span className="shrink-0 text-slate-500">
                  {product.is_serialized ? 'scan the unit' : priceLabel(product)}
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching items.</li>}
        </ul>
      )}
    </div>
  );
}

// The shop's one-tap items, shown under the scan box when there are any.
export function QuickPicks({ onPick }: { onPick: (product: ScannedProduct) => void }) {
  const [picks, setPicks] = useState<ScannedProduct[]>([]);

  useEffect(() => {
    let active = true;
    fetchQuickPicks().then(
      (loaded) => {
        if (active) setPicks(loaded);
      },
      () => {
        // Only a convenience: scanning and searching still work.
      },
    );
    return () => {
      active = false;
    };
  }, []);

  if (picks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2" aria-label="Quick picks">
      {picks.map((product) => (
        <button
          key={product.id}
          onClick={() => onPick(product)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {product.name} · {priceLabel(product)}
        </button>
      ))}
    </div>
  );
}
