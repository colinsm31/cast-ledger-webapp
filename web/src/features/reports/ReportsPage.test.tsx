// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const row = (over: Record<string, unknown>) => ({
  group_key: 'k', label: 'L', detail: null, tickets: 1, qty_sold: 1, sales: 10, discounts: 0, qty_returned: 0,
  returns: 0, net_qty: 1, net_sales: 10, costed_sales: 10, cost: 4, margin: 6, margin_pct: 60, uncosted_qty: 0,
  cost_estimated: false, ...over,
});
const byGroup: Record<string, unknown[]> = {
  category: [
    row({ group_key: 'stringing', label: 'Stringing', sales: 30, net_sales: 30, costed_sales: 0, cost: 0, margin: null, margin_pct: null }),
    row({ group_key: 'c1', label: 'Strings', qty_sold: 2, sales: 40, discounts: 10, qty_returned: 1, returns: 20, net_sales: 20, costed_sales: 20, cost: 8, margin: 12, margin_pct: 60 }),
  ],
  product: [
    row({ group_key: 'stringing', label: 'Stringing', net_qty: 9 }),
    row({ group_key: 'p1', label: 'Head Grip', detail: 'Grips', net_qty: 1, net_sales: 5 }),
    row({ group_key: 'p2', label: 'Wilson String', detail: 'Strings', net_qty: 3, net_sales: 30, cost_estimated: true }),
    row({ group_key: 'p3', label: 'Returned Only', net_qty: -1 }),
  ],
  staff: [row({ group_key: 'u1', label: 'pat@shop.test', tickets: 4 })],
};
const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => ({ range: () => rpc(...args) }) } }));
vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));
vi.mock('../../lib/settings', () => ({ useSettings: () => ({ settings: { week_starts_monday: false }, error: null, reload: () => {} }) }));
const download = vi.fn();
vi.mock('../../lib/csv', async (original) => ({ ...(await original<typeof import('../../lib/csv')>()), downloadCsv: (...args: unknown[]) => download(...args) }));

const { ReportsPage } = await import('./ReportsPage');

beforeEach(() => {
  rpc.mockImplementation(async (_fn: string, args: { p_group: string }) => ({ data: byGroup[args.p_group] ?? [], error: null }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const csvText = () => download.mock.calls.at(-1)?.[1] as string;

describe('ReportsPage', () => {
  it('opens on sales by category for the month to date, with totals', async () => {
    render(<ReportsPage />);
    expect(await screen.findByText('Strings')).toBeTruthy();
    const [fn, args] = rpc.mock.calls[0] as [string, { p_from: string; p_to: string; p_group: string }];
    expect(fn).toBe('report_sales_by');
    expect(args.p_group).toBe('category');
    const now = new Date();
    expect(args.p_from).toBe(new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
    const total = screen.getByText('Total').closest('tr')!;
    expect(within(total).getByText('$70.00')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download.mock.calls[0][0]).toMatch(/^sales-by-category_/);
    expect(csvText()).toContain('Category,Qty sold,Sales,Discounts,Qty returned,Returns,Net qty,Net sales\r\n');
    expect(csvText()).toContain('Strings,2,40,10,1,20,1,20\r\n');
    expect(csvText()).toContain('Total,3,70,10,1,20,2,50\r\n');
  });

  it('groups by staff member with a tickets column', async () => {
    render(<ReportsPage />);
    await screen.findByText('Strings');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'staff' } });
    expect(await screen.findByText('pat@shop.test')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Tickets' })).toBeTruthy();
  });

  it('shows margin with an overall margin % and marks estimated costs', async () => {
    render(<ReportsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Gross margin' }));
    await screen.findByText('Strings');
    const total = screen.getByText('Total').closest('tr')!;
    expect(within(total).getByText('60.0%')).toBeTruthy();
    expect(screen.queryByText(/today’s cost, an estimate/)).toBeNull();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'product' } });
    expect(await screen.findByText('Wilson String *')).toBeTruthy();
    expect(screen.getByText(/today’s cost, an estimate/)).toBeTruthy();
  });

  it('ranks best-sellers by quantity, products only', async () => {
    render(<ReportsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Best-sellers' }));
    await screen.findByText('Wilson String');
    const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td')?.textContent);
    expect(names).toEqual(['Wilson String', 'Head Grip']);
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(csvText()).toBe('Product,Category,Net qty,Net sales,Margin %\r\nWilson String,Strings,3,30,60\r\nHead Grip,Grips,1,5,60\r\n');
  });

  it('shows a failed report with Retry, and an empty one plainly', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Only an admin can see reports' } });
    render(<ReportsPage />);
    expect(await screen.findByText(/Only an admin can see reports/)).toBeTruthy();
    rpc.mockResolvedValueOnce({ data: [], error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Nothing in this period.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Download CSV' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows inventory value as of now, without a period', async () => {
    render(<ReportsPage />);
    await screen.findByText('Strings');
    fireEvent.click(screen.getByRole('button', { name: 'Inventory value' }));
    expect(screen.queryByRole('button', { name: 'Month to date' })).toBeNull();
    await waitFor(() => expect(rpc).toHaveBeenLastCalledWith('report_inventory_value', {}));
  });

  it('waits for a full custom range', async () => {
    render(<ReportsPage />);
    await screen.findByText('Strings');
    fireEvent.click(screen.getByRole('button', { name: 'Custom range' }));
    await waitFor(() => expect(screen.getByText('Choose a start and end date.')).toBeTruthy());
    expect(screen.queryByText('Loading…')).toBeNull();
    expect(screen.queryByText('Strings')).toBeNull();
  });
});
