// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const summaryRow = {
  gross: 100, tax: 8.25, refunds: 0, net: 108.25, card: 108.25, cash: 0, check_amt: 0, store_credit: 0,
  gift_card: 0, num_customers: 1, num_tickets: 1, num_items: 2, gift_cards_sold: 0, price_changes: 0,
  price_change_total: 0, discounts: 0, discount_total: 0, exempt_tickets: 0, exempt_sales: 0,
};
const tickets = [
  { id: 's1', sold_at: '2026-11-25T15:00:00Z', subtotal: 100, tax: 8.25, customers: { first_name: 'Pat', last_name: 'Tester' } },
  { id: 's2', sold_at: '2026-11-25T16:00:00Z', subtotal: 20, tax: 0, customers: null },
];
const rpc = vi.fn();
const lt = vi.fn();
const query = { select: () => query, gte: () => query, lt: (...args: unknown[]) => (lt(...args), query), order: () => query, range: async () => ticketsResult() };
let ticketsResult = () => ({ data: tickets as unknown, error: null as unknown });
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => query, rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));
vi.mock('../../lib/settings', () => ({ useSettings: () => ({ settings: { week_starts_monday: false }, error: null, reload: () => {} }) }));
const download = vi.fn();
vi.mock('../../lib/csv', async (original) => ({ ...(await original<typeof import('../../lib/csv')>()), downloadCsv: (...args: unknown[]) => download(...args) }));

const { SalesListPage } = await import('./SalesListPage');

beforeEach(() => {
  rpc.mockResolvedValue({ data: [summaryRow], error: null });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  render(
    <MemoryRouter>
      <SalesListPage />
    </MemoryRouter>,
  );
}

describe('SalesListPage', () => {
  it('shows the summary and saves it as CSV', async () => {
    renderPage();
    expect(await screen.findByText('$108.25', { selector: 'span.text-lg' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    const [name, text] = download.mock.calls[0] as [string, string];
    expect(name).toMatch(/^sales-summary_\d{4}-\d{2}-\d{2}\.csv$/);
    expect(text).toContain('Item,Value\r\nGross sales,100.00\r\n');
    expect(text).toContain('Number of sales tickets,1\r\n');
  });

  it('saves the tickets as CSV', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Tickets' }));
    expect(await screen.findByText('Tester, Pat')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    const text = download.mock.calls[0][1] as string;
    expect(text).toContain('Sold at,Customer,Subtotal,Tax,Total,Ticket ID\r\n');
    expect(text).toContain('"Tester, Pat",100.00,8.25,108.25,s1');
    expect(text).toContain('Unidentified Customer,20.00,0.00,20.00,s2');
  });

  it('asks for both days of a custom range, then loads through the end day', async () => {
    renderPage();
    await screen.findByText('$108.25', { selector: 'span.text-lg' });
    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }));
    expect(screen.getByText('Choose a start and end date.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Download CSV' }) as HTMLButtonElement).disabled).toBe(true);
    const [from, to] = screen.getAllByDisplayValue('') as HTMLInputElement[];
    fireEvent.change(from, { target: { value: '2026-11-05' } });
    fireEvent.change(to, { target: { value: '2026-11-01' } });
    expect(screen.getByText('The end date is before the start date.')).toBeTruthy();
    fireEvent.change(to, { target: { value: '2026-11-06' } });
    await waitFor(() => expect(lt).toHaveBeenLastCalledWith('sold_at', new Date(2026, 10, 7).toISOString()));
  });

  it('shows a failed tickets load with Retry', async () => {
    ticketsResult = () => ({ data: null, error: { message: 'offline' } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Tickets' }));
    expect(await screen.findByText(/Couldn't load the tickets: offline/)).toBeTruthy();
    ticketsResult = () => ({ data: tickets, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Tester, Pat')).toBeTruthy();
  });

  it('shows a failed summary with Retry', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    renderPage();
    expect(await screen.findByText(/Couldn't load the summary/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('$108.25', { selector: 'span.text-lg' })).toBeTruthy();
  });
});
