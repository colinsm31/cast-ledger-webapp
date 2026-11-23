// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));
vi.mock('../../lib/settings', () => ({ useSettings: () => ({ settings: { accept_checks: false } }) }));

let quoteTotal = 32.48;
let customerActive = true;
vi.mock('../../lib/saleQuote', async (original) => ({
  ...(await original<typeof import('../../lib/saleQuote')>()),
  fetchSaleQuote: vi.fn(async () => ({
    subtotal: 0,
    tax: 0,
    taxRate: 8.25,
    total: quoteTotal,
    problems: [],
    listPrices: [],
    discountTotal: 0,
    maxDiscountPercent: 0,
    taxExemptId: null,
  })),
}));

const grip = {
  id: 'line-grip',
  product_id: 'p-grip',
  product_unit_id: null,
  string_job_id: null,
  gift_card_id: null,
  qty: 2,
  unit_price: 30,
  taxable: true,
  products: { brand: null, name: 'Overgrip', attributes: null },
  string_jobs: null,
  gift_cards: null,
};
vi.mock('./saleForReturn', async (original) => ({
  ...(await original<typeof import('./saleForReturn')>()),
  loadSaleForReturn: vi.fn(async () => ({
    id: 'sale-1',
    tax: 4.95,
    tax_rate: 8.25,
    customer_id: 'cust-1',
    customers: { first_name: 'Pat', last_name: 'Tester', is_active: customerActive },
    sale_lines: [grip],
    sale_payments: [{ method: 'credit', amount: 64.95, gift_card_id: null, gift_cards: null }],
    refunds: [],
  })),
}));

// The product search, reduced to one product to pick.
vi.mock('./ProductFinder', () => ({
  ProductFinder: ({ onPick }: { onPick: (p: unknown) => void }) => (
    <>
      <button onClick={() => onPick({ id: 'p-grip', brand: null, name: 'Overgrip', attributes: null, sell_price: 30, is_serialized: false })}>
        Pick overgrip
      </button>
      <button onClick={() => onPick({ id: 'p-frame', brand: null, name: 'Frame', attributes: null, sell_price: 200, is_serialized: true })}>
        Pick frame
      </button>
    </>
  ),
}));

const { ExchangePage } = await import('./ExchangePage');

afterEach(() => {
  cleanup();
  rpc.mockReset();
  customerActive = true;
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/sales/sale-1/exchange']}>
      <Routes>
        <Route path="/sales/:saleId/exchange" element={<ExchangePage />} />
        <Route path="/sales/:saleId" element={<p>Sale page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function chooseOneGripBackAndOneNew() {
  renderPage();
  await screen.findByText('Overgrip');
  fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Pick overgrip' }));
}

describe('ExchangePage', () => {
  it('asks for both sides before going on', async () => {
    renderPage();
    await screen.findByText('Overgrip');
    fireEvent.click(screen.getByRole('button', { name: 'Complete exchange' }));
    expect(screen.getByText('Choose what the customer is bringing back.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pick frame' }));
    expect(screen.getByText(/Sell a racquet frame from the register/)).toBeTruthy();
  });

  it('completes an even swap in one step', async () => {
    quoteTotal = 32.48;
    rpc.mockResolvedValue({ data: { sale_id: 'sale-2' }, error: null });
    await chooseOneGripBackAndOneNew();
    await screen.findByText('Even swap');
    fireEvent.click(screen.getByRole('button', { name: 'Complete exchange' }));
    expect(await screen.findByText('Sale page')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('record_exchange', expect.objectContaining({
      p_sale_id: 'sale-1',
      p_return_lines: [{ sale_line_id: 'line-grip', qty: 1 }],
      p_new_lines: [{ product_id: 'p-grip', qty: 1, unit_price: 30 }],
      p_customer_id: 'cust-1',
      p_payments: [],
      p_refund_payments: [],
    }));
  });

  it('collects what the customer owes on the payment screen', async () => {
    quoteTotal = 43.31;
    await chooseOneGripBackAndOneNew();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Collect $10.83' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Collect $10.83' }));
    expect(await screen.findByText('Exchange: customer owes')).toBeTruthy();
  });

  it('gives back what the customer is owed', async () => {
    quoteTotal = 21.65;
    await chooseOneGripBackAndOneNew();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Give back $10.83' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Give back $10.83' }));
    expect(await screen.findByText('Exchange: customer is owed')).toBeTruthy();
  });

  it('stops an inactive customer\'s exchange before anything is chosen', async () => {
    customerActive = false;
    renderPage();
    expect(await screen.findAllByText(/This customer is inactive, so they can’t exchange/)).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Complete exchange' }));
    expect(screen.getAllByText(/This customer is inactive, so they can’t exchange/)).toHaveLength(2);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('shows what the server refused', async () => {
    quoteTotal = 32.48;
    rpc.mockResolvedValue({ data: null, error: { message: 'Cannot return 1 of line (only 0 remaining)' } });
    await chooseOneGripBackAndOneNew();
    await screen.findByText('Even swap');
    fireEvent.click(screen.getByRole('button', { name: 'Complete exchange' }));
    expect(await screen.findByText(/only 0 remaining/)).toBeTruthy();
  });
});
