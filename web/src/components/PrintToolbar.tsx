import { Link, useSearchParams } from 'react-router-dom';
import {
  chooseLayout,
  pageRule,
  rememberedLayout,
  rememberLayout,
  RECEIPT_LAYOUTS,
  type ReceiptLayout,
} from '../lib/receiptLayout';

/**
 * The printed layout for a page outside the app's frame: the one in the
 * address, else this device's last, else thermal. Choosing one remembers it.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePrintLayout() {
  const [searchParams, setSearchParams] = useSearchParams();
  const layout = chooseLayout(searchParams.get('layout'), rememberedLayout());

  function choose(next: ReceiptLayout) {
    rememberLayout(next);
    setSearchParams({ layout: next }, { replace: true });
  }

  function print() {
    rememberLayout(layout);
    window.print();
  }

  return { layout, choose, print };
}

// The bar above a printable page (receipt, daily report): back link, layout
// choice and Print. Hidden when printing; sets the page size for the layout.
export function PrintToolbar({
  backTo,
  backLabel,
  layout,
  onChoose,
  onPrint,
  canPrint,
}: {
  backTo: string;
  backLabel: string;
  layout: ReceiptLayout;
  onChoose: (layout: ReceiptLayout) => void;
  onPrint: () => void;
  canPrint: boolean;
}) {
  return (
    <>
      <style>{pageRule(layout)}</style>
      <div className="mx-auto mb-4 flex max-w-2xl flex-wrap items-center gap-2 print:hidden">
        <Link to={backTo} className="text-sm text-blue-600 hover:underline">
          ← {backLabel}
        </Link>
        <div className="ml-auto flex gap-1 rounded-lg border border-slate-300 bg-white p-1" role="group" aria-label="Layout">
          {RECEIPT_LAYOUTS.map((option) => (
            <button
              key={option.value}
              onClick={() => onChoose(option.value)}
              aria-pressed={layout === option.value}
              className={`rounded px-3 py-1 text-sm ${
                layout === option.value ? 'bg-blue-600 font-semibold text-white' : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          onClick={onPrint}
          disabled={!canPrint}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Print
        </button>
      </div>
    </>
  );
}
