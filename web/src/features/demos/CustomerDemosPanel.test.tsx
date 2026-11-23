// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

let result: { data: unknown; error: unknown } = { data: [], error: null };
const eq = vi.fn(() => query);
const query = { select: () => query, eq, order: async () => result };
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => query } }));

const { CustomerDemosPanel } = await import('./CustomerDemosPanel');

afterEach(cleanup);

const loan = (n: number, extra: object) => ({
  id: `l${n}`,
  loan_number: n,
  product_unit_id: `u${n}`,
  customer_id: 'c1',
  out_at: '2026-11-10T10:00:00Z',
  due_back_at: '2026-11-13T10:00:00Z',
  back_at: null,
  back_status: null,
  back_reason: null,
  sale_id: null,
  customers: { id: 'c1', first_name: 'Pat', last_name: 'Tester', phone_number: null },
  product_units: { id: `u${n}`, barcode: `DM-${n}`, product_id: 'p1', products: { brand: 'Head', name: 'Speed MP' } },
  ...extra,
});

function renderPanel() {
  render(
    <MemoryRouter>
      <CustomerDemosPanel customerId="c1" />
    </MemoryRouter>,
  );
}

describe('CustomerDemosPanel', () => {
  it('lists the customer\'s demos with the one that led to a sale', async () => {
    result = {
      data: [loan(1002, {}), loan(1001, { back_at: '2026-11-12T10:00:00Z', back_status: 'demo', sale_id: 's1' })],
      error: null,
    };
    renderPanel();
    expect(await screen.findByText('1 of 2 led to a sale')).toBeTruthy();
    expect(eq).toHaveBeenCalledWith('customer_id', 'c1');
    expect(screen.getByText('Out')).toBeTruthy();
    expect(screen.getByText(/still out/)).toBeTruthy();
    expect(screen.getByText('Bought').getAttribute('href')).toBe('/sales/s1');
    expect(screen.queryByText('Tester, Pat')).toBeNull();
  });

  it('says when there are none, or they can\'t load', async () => {
    result = { data: [], error: null };
    renderPanel();
    expect(await screen.findByText('This customer hasn’t borrowed a demo.')).toBeTruthy();
    cleanup();
    result = { data: null, error: { message: 'offline' } };
    renderPanel();
    expect(await screen.findByText("Couldn't load the demos: offline")).toBeTruthy();
    result = { data: [], error: null };
    fireEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('This customer hasn’t borrowed a demo.')).toBeTruthy();
  });
});
