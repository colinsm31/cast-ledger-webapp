// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A fake supabase: product_units ends at the second order(); demo_loans at in().
type Result = { data: unknown; error: unknown };
let unitsResult: Result = { data: [], error: null };
let loansResult: Result = { data: [], error: null };
const unitsQuery = { select: () => unitsQuery, eq: () => unitsQuery, order: () => ordered };
const ordered = { order: async () => unitsResult };
const loansQuery = { select: () => loansQuery, is: () => loansQuery, in: async () => loansResult };
vi.mock('../../lib/supabase', () => ({
  supabase: { from: (table: string) => (table === 'demo_loans' ? loansQuery : unitsQuery), rpc: vi.fn() },
}));
vi.mock('../../lib/settings', () => ({ useSettings: () => ({ settings: { demo_loan_days: 3 }, error: null, reload: () => {} }) }));

const { UnitsSection } = await import('./UnitsSection');

afterEach(cleanup);

const frame = (id: string, barcode: string, status: string) => ({
  id,
  product_id: 'p1',
  barcode,
  status,
  customer_id: null,
  sale_id: null,
  note: null,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
});
const loan = {
  id: 'l1',
  loan_number: 1001,
  product_unit_id: 'u1',
  customer_id: 'c1',
  out_at: '2026-11-20T10:00:00Z',
  due_back_at: '2099-11-21T10:00:00Z',
  deposit_note: null,
  back_at: null,
  customers: { id: 'c1', first_name: 'Pat', last_name: 'Tester', phone_number: null },
};

function renderSection() {
  render(
    <MemoryRouter>
      <UnitsSection productId="p1" productLabel="Pure Aero" />
    </MemoryRouter>,
  );
}

describe('UnitsSection', () => {
  it('shows who has a frame out on demo', async () => {
    unitsResult = { data: [frame('u1', 'DM-1', 'assigned'), frame('u2', 'DM-2', 'demo')], error: null };
    loansResult = { data: [loan], error: null };
    renderSection();
    expect(await screen.findByText('Tester, Pat')).toBeTruthy();
    expect(screen.getByText('out on demo')).toBeTruthy();
    expect(screen.getAllByText('Lend')).toHaveLength(1); // only the frame in the demo fleet
  });

  it('shows frames only with their loans, and clears an error once a retry works', async () => {
    unitsResult = { data: [frame('u1', 'DM-1', 'assigned')], error: null };
    loansResult = { data: null, error: { message: 'offline' } };
    renderSection();
    expect(await screen.findByText("Couldn't load who has the demos: offline")).toBeTruthy();
    expect(screen.queryByText('DM-1')).toBeNull(); // not shown without its loan

    loansResult = { data: [loan], error: null };
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('Tester, Pat')).toBeTruthy();
    expect(screen.queryByText(/Couldn't load/)).toBeNull();
  });

  it('never shows a stale loan on a frame that came back', async () => {
    // The loan list still has the loan, but the frame is back in the demo fleet.
    unitsResult = { data: [frame('u1', 'DM-1', 'demo')], error: null };
    loansResult = { data: [loan], error: null };
    renderSection();
    expect(await screen.findByText('Lend')).toBeTruthy();
    expect(screen.queryByText(/Out with/)).toBeNull();
  });
});
