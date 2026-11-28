// A day's report for the end-of-day tests.
import type { DayReport } from '../../lib/dayReport';

export const sampleReport: DayReport = {
  day: '2026-11-27',
  time_zone: 'America/Chicago',
  sales: { count: 3, items: 80, gift_cards: 25, tax: 6.6, total: 111.6 },
  refunds: { count: 1, items: 20, gift_cards: 0, tax: 1.65, total: 21.65 },
  net: { items: 60, tax: 4.95, total: 89.95 },
  exchanges: { count: 1, credit: 10 },
  payments: [
    { method: 'cash', label: 'Cash', taken: 54.13, given_back: 21.65, net: 32.48 },
    { method: 'credit', label: 'Card', taken: 57.47, given_back: 0, net: 57.47 },
  ],
  categories: [
    { name: 'Stringing', sold: 30, returned: 0, net: 30 },
    { name: 'Strings', sold: 50, returned: 20, net: 30 },
  ],
  drawers: [
    {
      drawer: 'Main drawer',
      opened_at: '2026-11-27T14:00:00Z',
      closed_at: '2026-11-27T23:00:00Z',
      float: 100,
      cash_sales: 54.13,
      cash_refunds: 21.65,
      paid_in: 0,
      paid_out: 5,
      expected: 127.48,
      counted: 127.33,
      over_short: -0.15,
    },
  ],
};
