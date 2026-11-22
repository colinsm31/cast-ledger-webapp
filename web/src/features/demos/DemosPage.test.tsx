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
  customers: { id: `c${n}`, first_name: first, last_name: 'Tester', phone_number: null },
  product_units: { id: `u${n}`, barcode, product_id: 'p1', products: { brand: 'Head', name: 'Speed MP' } },
});
let result: { data: unknown; error: unknown } = { data: [], error: null };
const query = { select: () => query, is: () => query, order: async () => result };
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => query, rpc: vi.fn() } }));
vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));

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
});
