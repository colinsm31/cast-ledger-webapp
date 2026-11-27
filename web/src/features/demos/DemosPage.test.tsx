// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const day = 24 * 60 * 60 * 1000;
const loanRow = (n: number, dueIn: number, first: string, barcode: string) => ({
  id: `l${n}`,
  loan_number: n,
  product_unit_id: `u${n}`,
  customer_id: `c${n}`,
  out_at: new Date(Date.now() - day).toISOString(),
  out_by: null,
  due_back_at: new Date(Date.now() + dueIn).toISOString(),
  deposit_note: n === 1001 ? 'Card on file' : null,
  note: null,
  back_at: null,
  back_by: null,
  back_status: null,
  back_reason: null,
  sale_id: null as string | null,
  customers: { id: `c${n}`, first_name: first, last_name: 'Tester', phone_number: null },
  product_units: { id: `u${n}`, barcode, product_id: 'p1', products: { brand: 'Head', name: 'Speed MP' } },
});
let result: { data: unknown; error: unknown } = { data: [], error: null };
let returned: { data: unknown; error: unknown } = { data: [], error: null };
// The open list ends at order(); the returned list goes on to limit().
const query = {
  select: () => query,
  is: () => query,
  not: () => query,
  order: () => Object.assign(Promise.resolve(result), { limit: async () => returned }),
};
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => query, rpc: vi.fn() } }));
vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));
const download = vi.fn();
vi.mock('../../lib/csv', async (original) => ({ ...(await original<typeof import('../../lib/csv')>()), downloadCsv: (...args: unknown[]) => download(...args) }));

const { DemosPage } = await import('./DemosPage');

afterEach(cleanup);

function renderPage() {
  render(
    <MemoryRouter>
      <DemosPage />
    </MemoryRouter>,
  );
}

describe('DemosPage', () => {
  it('lists demos out, the overdue one first, and filters by a scan', async () => {
    result = { data: [loanRow(1001, 2 * day, 'Pat', 'DM-1'), loanRow(1002, -day, 'Sam', 'DM-2')], error: null };
    renderPage();
    expect(await screen.findByText('1 overdue')).toBeTruthy();
    const numbers = screen.getAllByText(/^D100\d$/).map((el) => el.textContent);
    expect(numbers).toEqual(['D1002', 'D1001']);
    expect(screen.getByText(/Deposit: Card on file/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download.mock.calls.at(-1)?.[0]).toMatch(/^demos-out_/);
    expect(download.mock.calls.at(-1)?.[1]).toContain('D1002,Head Speed MP,DM-2,"Tester, Sam"');

    fireEvent.change(screen.getByPlaceholderText(/Scan a frame/), { target: { value: 'dm-1' } });
    expect(screen.queryByText('D1002')).toBeNull();
    expect(screen.getByText('D1001')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Scan a frame/), { target: { value: 'nobody' } });
    expect(screen.getByText('Nothing matches')).toBeTruthy();
  });

  it('says when no demos are out, and when the list can\'t load', async () => {
    result = { data: [], error: null };
    renderPage();
    expect(await screen.findByText('No demos are out')).toBeTruthy();
    cleanup();
    result = { data: null, error: { message: 'offline' } };
    renderPage();
    expect(await screen.findByText('offline')).toBeTruthy();
  });

  it('lists returned demos and which led to a sale', async () => {
    result = { data: [], error: null };
    returned = {
      data: [
        { ...loanRow(1001, -day, 'Pat', 'DM-1'), back_at: new Date().toISOString(), back_status: 'demo', sale_id: 's1' },
        { ...loanRow(1002, -day, 'Sam', 'DM-2'), back_at: new Date().toISOString(), back_status: 'retired', back_reason: 'Cracked' },
      ],
      error: null,
    };
    renderPage();
    fireEvent.click(await screen.findByText('Returned'));
    expect(await screen.findByText('1 of 2 led to a sale')).toBeTruthy();
    expect(screen.getByText('Bought').getAttribute('href')).toBe('/sales/s1');
    expect(screen.getByText('Back, retired')).toBeTruthy();
    expect(screen.getByText(/Cracked/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download.mock.calls.at(-1)?.[0]).toMatch(/^demos-returned-latest-\d+_/);
    expect(download.mock.calls.at(-1)?.[1]).toContain(',Retired,Cracked,');
    expect(screen.getByText('Tester, Sam')).toBeTruthy();
    fireEvent.click(screen.getByText('Out now'));
    expect(await screen.findByText('No demos are out')).toBeTruthy();
  });

  it('says when no demos have come back, and when they can\'t load', async () => {
    returned = { data: [], error: null };
    renderPage();
    fireEvent.click(await screen.findByText('Returned'));
    expect(await screen.findByText('No demos have come back yet')).toBeTruthy();
    cleanup();
    returned = { data: null, error: { message: 'offline' } };
    renderPage();
    fireEvent.click(await screen.findByText('Returned'));
    expect(await screen.findByText('offline')).toBeTruthy();
  });
});
