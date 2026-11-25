// The Sales list's summary and tickets: their lines, and as CSV.
import { customerNameLastFirst } from '../../types/domain';
import { csvMoney, localDateTimeString, toCsv } from '../../lib/csv';

export interface Summary {
  gross: number;
  tax: number;
  refunds: number;
  net: number;
  card: number;
  cash: number;
  check_amt: number;
  store_credit: number;
  gift_card: number;
  num_customers: number;
  num_tickets: number;
  num_items: number;
  gift_cards_sold: number;
  price_changes: number;
  price_change_total: number;
  discounts: number;
  discount_total: number;
  exempt_tickets: number;
  exempt_sales: number;
}

export interface TicketRow {
  id: string;
  sold_at: string;
  subtotal: number;
  tax: number;
  customers: { first_name: string; last_name: string } | null;
}


// The summary's lines, in order: shown on screen and saved to CSV alike.
export const SUMMARY_ROWS: { key: keyof Summary; label: string; kind: 'money' | 'count'; strong?: boolean }[] = [
  { key: 'gross', label: 'Gross sales', kind: 'money' },
  { key: 'gift_cards_sold', label: 'Gift cards sold', kind: 'money' },
  { key: 'tax', label: 'Sales tax collected', kind: 'money' },
  { key: 'refunds', label: 'Total refunds issued', kind: 'money' },
  { key: 'net', label: 'Total net receipts', kind: 'money', strong: true },
  { key: 'card', label: 'Net credit/debit card receipts', kind: 'money' },
  { key: 'cash', label: 'Net cash receipts', kind: 'money' },
  { key: 'check_amt', label: 'Net receipts paid by check', kind: 'money' },
  { key: 'store_credit', label: 'Net store credit issued (redeemed) in sales transactions', kind: 'money' },
  { key: 'gift_card', label: 'Net purchases made with gift cards/certificates', kind: 'money' },
  { key: 'num_customers', label: 'Number of customers', kind: 'count' },
  { key: 'num_tickets', label: 'Number of sales tickets', kind: 'count' },
  { key: 'num_items', label: 'Number of items sold (net of returns)', kind: 'count' },
  { key: 'price_changes', label: 'Price changes at the register', kind: 'count' },
  { key: 'price_change_total', label: 'Net effect of price changes', kind: 'money' },
  { key: 'discounts', label: 'Discounted lines at the register', kind: 'count' },
  { key: 'discount_total', label: 'Total discounts given', kind: 'money' },
  { key: 'exempt_tickets', label: 'Tax-exempt sales tickets', kind: 'count' },
  { key: 'exempt_sales', label: 'Tax-exempt sales (no tax charged)', kind: 'money' },
];

export function summaryCsv(summary: Summary): string {
  return toCsv(
    ['Item', 'Value'],
    SUMMARY_ROWS.map((row) => [row.label, row.kind === 'money' ? csvMoney(summary[row.key]) : summary[row.key]]),
  );
}

export function ticketsCsv(tickets: TicketRow[]): string {
  return toCsv(
    ['Sold at', 'Customer', 'Subtotal', 'Tax', 'Total', 'Ticket ID'],
    tickets.map((sale) => [
      localDateTimeString(sale.sold_at),
      sale.customers ? customerNameLastFirst(sale.customers) : 'Unidentified Customer',
      csvMoney(Number(sale.subtotal)),
      csvMoney(Number(sale.tax)),
      csvMoney(Number(sale.subtotal) + Number(sale.tax)),
      sale.id,
    ]),
  );
}

export function normalizeSummary(r: Record<string, unknown>): Summary {
  const n = (k: string) => Number(r[k] ?? 0);
  return {
    gross: n('gross'),
    tax: n('tax'),
    refunds: n('refunds'),
    net: n('net'),
    card: n('card'),
    cash: n('cash'),
    check_amt: n('check_amt'),
    store_credit: n('store_credit'),
    gift_card: n('gift_card'),
    num_customers: n('num_customers'),
    num_tickets: n('num_tickets'),
    num_items: n('num_items'),
    gift_cards_sold: n('gift_cards_sold'),
    price_changes: n('price_changes'),
    price_change_total: n('price_change_total'),
    discounts: n('discounts'),
    discount_total: n('discount_total'),
    exempt_tickets: n('exempt_tickets'),
    exempt_sales: n('exempt_sales'),
  };
}
