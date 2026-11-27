// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));
vi.mock('../../lib/settings', async (original) => ({
  ...(await original<typeof import('../../lib/settings')>()),
  useSettings: () => ({ settings: { accept_checks: false } }),
}));

let quoteTotal = 32.48;
let quoteFails = false;
let saleCustomerId: string | null = 'cust-1';
let customerActive = true;
vi.mock('../../lib/saleQuote', async (original) => ({
  ...(await original<typeof import('../../lib/saleQuote')>()),
  fetchSaleQuote: vi.fn(async () => {
    if (quoteFails) throw new Error('The price check failed');
    return {
    subtotal: 0,
    tax: 0,
    taxRate: 8.25,
    total: quoteTotal,
    problems: [],
    listPrices: [],
    discountTotal: 0,
    maxDiscountPercent: 0,
    taxExemptId: null,
    };
  }),
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
    customer_id: saleCustomerId,
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
const { DialogProvider } = await import('../../components/Dialog');

afterEach(() => {
  cleanup();
  rpc.mockReset();
  customerActive = true;
  quoteFails = false;
  saleCustomerId = 'cust-1';
});

function renderPage() {
  render(
    <DialogProvider>
      <MemoryRouter initialEntries={['/sales/sale-1/exchange']}>
        <Routes>
          <Route path="/sales/:saleId/exchange" element={<ExchangePage />} />
          <Route path="/sales/:saleId" element={<p>Sale page</p>} />
        </Routes>
      </MemoryRouter>
    </DialogProvider>,
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

  it('waits for the new total when the items change', async () => {
    quoteTotal = 43.31;
    await chooseOneGripBackAndOneNew();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Collect $10.83' })).toBeTruthy());
    quoteFails = true;
    fireEvent.click(screen.getByRole('button', { name: 'Pick overgrip' }));
    expect(await screen.findByText('The price check failed')).toBeTruthy();
    expect(screen.getByText('Working out the difference')).toBeTruthy();
    // A failed check can be tried again, without re-adding anything.
    quoteFails = false;
    quoteTotal = 75.79;
    fireEvent.click(screen.getByRole('button', { name: 'Check prices again' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Collect $43.31' })).toBeTruthy());
    expect(screen.queryByText('The price check failed')).toBeNull();
  });

  it('gives back onto any gift card, and offers store credit only with a customer', async () => {
    quoteTotal = 21.65;
    saleCustomerId = null;
    await chooseOneGripBackAndOneNew();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Give back $10.83' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Give back $10.83' }));
    await screen.findByText('Exchange: customer is owed');
    expect(screen.queryByRole('button', { name: 'Store Credit' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gift Card' }));
    expect(screen.getByText('Give back onto a gift card')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add $10.83' })).toBeTruthy();
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
