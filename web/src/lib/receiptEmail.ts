// A receipt as an email (0087): the printed letter layout (ReceiptView) drawn
// as HTML with inline styles, since email apps ignore the app's stylesheet,
// plus a plain-text copy for apps that don't show HTML. Every value is
// escaped: names and notes come from what staff typed.
import type { Receipt } from './receipt';

const dollars = (amount: number) => `$${amount.toFixed(2)}`;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatSoldAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/** The totals block's rows, shared by the HTML and the text. */
function totalRows(receipt: Receipt): { label: string; value: string; strong?: boolean }[] {
  return [
    ...(receipt.discountTotal > 0
      ? [
          {
            label: receipt.ticketDiscountNote ? `You saved (incl. ${receipt.ticketDiscountNote})` : 'You saved',
            value: dollars(receipt.discountTotal),
          },
        ]
      : []),
    { label: 'Subtotal', value: dollars(receipt.subtotal) },
    { label: receipt.taxLabel, value: dollars(receipt.tax) },
    { label: 'Total', value: dollars(receipt.total), strong: true },
    ...receipt.payments.map((payment) => ({ label: payment.label, value: dollars(payment.amount) })),
    ...(receipt.refundedTotal > 0 ? [{ label: 'Refunded since', value: `−${dollars(receipt.refundedTotal)}` }] : []),
  ];
}

/** The header's right-hand lines: number, time, who served, customer. */
function saleLines(receipt: Receipt): string[] {
  return [
    `Receipt ${receipt.number}`,
    formatSoldAt(receipt.soldAt),
    ...(receipt.servedBy ? [`Served by ${receipt.servedBy}`] : []),
    ...(receipt.customer ? [`Customer: ${receipt.customer}`] : []),
  ];
}

const CELL = 'padding:4px 0;';
const RIGHT = 'text-align:right;white-space:nowrap;';

export function receiptEmailHtml(receipt: Receipt): string {
  const e = escapeHtml;
  const lineRows = receipt.lines
    .map(
      (line) => `<tr style="vertical-align:top;border-bottom:1px solid #cbd5e1;">
<td style="${CELL}">${e(line.label)}${line.notes.map((note) => `<div style="font-size:12px;color:#475569;">${e(note)}</div>`).join('')}</td>
<td style="${CELL}${RIGHT}">${line.qty}</td>
<td style="${CELL}${RIGHT}">${dollars(line.unitPrice)}</td>
<td style="${CELL}${RIGHT}">${dollars(line.total)}</td></tr>`,
    )
    .join('\n');
  const totals = totalRows(receipt)
    .map(
      (row) =>
        `<tr${row.strong ? ' style="font-weight:bold;"' : ''}><td style="padding:2px 16px 2px 0;">${e(row.label)}</td><td style="padding:2px 0;${RIGHT}">${e(row.value)}</td></tr>`,
    )
    .join('\n');
  const cards = receipt.giftCards
    .map((card) => `<tr><td style="padding:2px 16px 2px 0;">${e(card.label)} balance</td><td style="${RIGHT}">${dollars(card.balance)}</td></tr>`)
    .join('\n');
  const footer =
    receipt.returnPolicy || receipt.footer
      ? `<div style="border-top:1px solid #000;margin-top:20px;padding-top:12px;">
${receipt.returnPolicy ? `<p style="white-space:pre-line;margin:0 0 8px;">${e(receipt.returnPolicy)}</p>` : ''}
${receipt.footer ? `<p style="font-weight:bold;margin:0;">${e(receipt.footer)}</p>` : ''}
</div>`
      : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Receipt ${e(receipt.number)}</title></head>
<body style="margin:0;padding:16px;background:#ffffff;color:#000000;font-family:Helvetica,Arial,sans-serif;font-size:14px;">
<div style="max-width:640px;margin:0 auto;">
<table role="presentation" style="width:100%;border-collapse:collapse;margin-bottom:20px;"><tr>
<td style="vertical-align:top;">${receipt.shopName ? `<h1 style="font-size:22px;margin:0 0 4px;">${e(receipt.shopName)}</h1>` : ''}${receipt.shopAddressLines.map((line) => `<div>${e(line)}</div>`).join('')}</td>
<td style="vertical-align:top;text-align:right;">${saleLines(receipt).map((line) => `<div>${e(line)}</div>`).join('')}</td>
</tr></table>
<table style="width:100%;border-collapse:collapse;">
<thead><tr style="border-bottom:1px solid #000;text-align:left;">
<th style="${CELL}">Item</th><th style="${CELL}${RIGHT}">Qty</th><th style="${CELL}${RIGHT}">Each</th><th style="${CELL}${RIGHT}">Total</th>
</tr></thead>
<tbody>
${lineRows}
</tbody></table>
<table role="presentation" style="margin:16px 0 0 auto;border-collapse:collapse;">
${totals}
</table>
${cards ? `<table role="presentation" style="margin:12px 0 0 auto;border-collapse:collapse;">\n${cards}\n</table>` : ''}
${footer}
</div>
</body></html>`;
}

export function receiptEmailText(receipt: Receipt): string {
  const width = 44;
  const row = (label: string, value: string) =>
    `${label}${' '.repeat(Math.max(1, width - label.length - value.length))}${value}`;
  const parts: string[] = [];
  if (receipt.shopName) parts.push(receipt.shopName);
  parts.push(...receipt.shopAddressLines, '', ...saleLines(receipt), '');
  for (const line of receipt.lines) {
    parts.push(line.label, row(`  ${line.qty} × ${dollars(line.unitPrice)}`, dollars(line.total)));
    parts.push(...line.notes.map((note) => `  ${note}`));
  }
  parts.push('', ...totalRows(receipt).map((r) => row(r.label, r.value)));
  if (receipt.giftCards.length) {
    parts.push('', ...receipt.giftCards.map((card) => row(`${card.label} balance`, dollars(card.balance))));
  }
  if (receipt.returnPolicy) parts.push('', receipt.returnPolicy);
  if (receipt.footer) parts.push('', receipt.footer);
  return parts.join('\n');
}
