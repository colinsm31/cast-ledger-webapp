import type { Receipt } from '../../lib/receipt';
import type { ReceiptLayout } from '../../lib/receiptLayout';

const dollars = (amount: number) => `$${amount.toFixed(2)}`;

function formatSoldAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

// A receipt as printed. Thermal is one narrow column in a monospace font;
// letter is a page with the lines in a table.
export function ReceiptView({ receipt, layout }: { receipt: Receipt; layout: ReceiptLayout }) {
  const thermal = layout === 'thermal';
  return (
    <article
      aria-label="Receipt"
      className={
        thermal
          ? 'mx-auto w-[72mm] space-y-3 bg-white font-mono text-[11px] leading-snug text-black'
          : 'mx-auto max-w-[7.3in] space-y-5 bg-white text-sm text-black'
      }
    >
      <header className={thermal ? 'text-center' : 'flex items-start justify-between'}>
        <div>
          {receipt.shopName && <h1 className={thermal ? 'text-sm font-bold' : 'text-2xl font-bold'}>{receipt.shopName}</h1>}
          {receipt.shopAddressLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <div className={thermal ? 'mt-2' : 'text-right'}>
          <p>Receipt {receipt.number}</p>
          <p>{formatSoldAt(receipt.soldAt)}</p>
          {receipt.servedBy && <p>Served by {receipt.servedBy}</p>}
          {receipt.customer && <p>Customer: {receipt.customer}</p>}
        </div>
      </header>

      {thermal ? (
        <ul className="space-y-1 border-y border-dashed border-black py-2">
          {receipt.lines.map((line, index) => (
            <li key={index}>
              <p>{line.label}</p>
              <Row label={`  ${line.qty} × ${dollars(line.unitPrice)}`} value={dollars(line.total)} />
              {line.notes.map((note) => (
                <p key={note} className="pl-2">
                  {note}
                </p>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 font-semibold">Item</th>
              <th className="py-1 text-right font-semibold">Qty</th>
              <th className="py-1 text-right font-semibold">Each</th>
              <th className="py-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line, index) => (
              <tr key={index} className="border-b border-slate-300 align-top">
                <td className="py-1">
                  {line.label}
                  {line.notes.map((note) => (
                    <div key={note} className="text-xs text-slate-600">
                      {note}
                    </div>
                  ))}
                </td>
                <td className="py-1 text-right tabular-nums">{line.qty}</td>
                <td className="py-1 text-right tabular-nums">{dollars(line.unitPrice)}</td>
                <td className="py-1 text-right tabular-nums">{dollars(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className={thermal ? 'space-y-0.5' : 'ml-auto w-64 space-y-1'}>
        {receipt.discountTotal > 0 && (
          <Row
            label={receipt.ticketDiscountNote ? `You saved (incl. ${receipt.ticketDiscountNote})` : 'You saved'}
            value={dollars(receipt.discountTotal)}
          />
        )}
        <Row label="Subtotal" value={dollars(receipt.subtotal)} />
        <Row label={receipt.taxLabel} value={dollars(receipt.tax)} />
        <Row label="Total" value={dollars(receipt.total)} strong />
        {receipt.payments.map((payment, index) => (
          <Row key={index} label={payment.label} value={dollars(payment.amount)} />
        ))}
        {receipt.refundedTotal > 0 && <Row label="Refunded since" value={`−${dollars(receipt.refundedTotal)}`} />}
      </section>

      {receipt.giftCards.length > 0 && (
        <section className={thermal ? 'border-t border-dashed border-black pt-2' : ''}>
          {receipt.giftCards.map((card) => (
            <Row key={card.label} label={`${card.label} balance`} value={dollars(card.balance)} />
          ))}
        </section>
      )}

      {(receipt.returnPolicy || receipt.footer) && (
        <footer className={thermal ? 'space-y-2 border-t border-dashed border-black pt-2 text-center' : 'space-y-2 border-t border-black pt-3'}>
          {receipt.returnPolicy && <p className="whitespace-pre-line">{receipt.returnPolicy}</p>}
          {receipt.footer && <p className="font-semibold">{receipt.footer}</p>}
        </footer>
      )}
    </article>
  );
}
