// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductUnit } from '../../types/domain';

// A fake supabase: rpc() for moves, from().select().eq().order() for the history.
const rpc = vi.fn(async (..._args: unknown[]) => ({ data: 'demo' as string | null, error: null as unknown }));
let historyResult: { data: unknown; error: unknown } = { data: [], error: null };
const query = { select: () => query, eq: () => query, order: async () => historyResult };
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args), from: () => query } }));

const { UnitRow } = await import('./UnitRow');

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

const unit: ProductUnit = {
  id: 'u1',
  product_id: 'p1',
  barcode: 'RQ-1',
  status: 'in_stock',
  customer_id: null,
  sale_id: null,
  note: null,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
};

function LabelsStub() {
  const location = useLocation();
  return <p>labels page {location.search}</p>;
}

function renderRow(row: ProductUnit, onChanged = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/products/p1']}>
      <Routes>
        <Route
          path="/products/p1"
          element={
            <ul>
              <UnitRow unit={row} onChanged={onChanged} />
            </ul>
          }
        />
        <Route path="/units/labels" element={<LabelsStub />} />
      </Routes>
    </MemoryRouter>,
  );
  return onChanged;
}

describe('UnitRow', () => {
  it('moves a frame with a reason', async () => {
    const onChanged = renderRow(unit);
    expect(screen.getByText('Sell')).toBeTruthy();
    fireEvent.click(screen.getByText('Move to demo'));

    const confirm = screen.getAllByText('Move to demo').find((el) => el.tagName === 'BUTTON' && el.className.includes('bg-blue'));
    expect((confirm as HTMLButtonElement).disabled).toBe(true); // no reason yet
    fireEvent.change(screen.getByPlaceholderText('e.g. demo fleet'), { target: { value: ' Demo fleet ' } });
    fireEvent.click(confirm as HTMLButtonElement);

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('set_unit_status', { p_unit_id: 'u1', p_status: 'demo', p_reason: 'Demo fleet' });
  });

  it('says why a move was refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'This frame is sold, so it can’t be moved here' } });
    renderRow({ ...unit, status: 'retired' });
    expect(screen.queryByText('Sell')).toBeNull();
    fireEvent.click(screen.getByText('Back in stock'));
    fireEvent.change(screen.getByPlaceholderText('e.g. demo fleet'), { target: { value: 'Repaired' } });
    fireEvent.click(screen.getAllByText('Back in stock').find((el) => el.className.includes('bg-blue')) as HTMLElement);
    await waitFor(() => expect(screen.getByText(/can’t be moved here/)).toBeTruthy());
  });

  it('adds a barcode to a frame that has none', async () => {
    const onChanged = renderRow({ ...unit, barcode: null });
    expect(screen.getByText('No barcode')).toBeTruthy();
    fireEvent.click(screen.getByText('Add barcode'));
    fireEvent.change(screen.getByPlaceholderText('Scan or type the frame’s barcode'), { target: { value: '400123' } });
    fireEvent.click(screen.getByText('Save barcode'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('set_unit_barcode', { p_unit_id: 'u1', p_barcode: '400123' });
  });

  it('labels a frame and opens its label to print', async () => {
    renderRow({ ...unit, barcode: null });
    fireEvent.click(screen.getByText('Print label'));
    await waitFor(() => expect(screen.getByText('labels page ?ids=u1')).toBeTruthy());
    expect(rpc).toHaveBeenCalledWith('assign_unit_label', { p_unit_id: 'u1' });
  });

  it('says why a label or barcode was refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Unknown unit u1' } });
    renderRow({ ...unit, barcode: null });
    fireEvent.click(screen.getByText('Print label'));
    await waitFor(() => expect(screen.getByText('Unknown unit u1')).toBeTruthy());

    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Barcode 400123 is already a gift card’s code' } });
    fireEvent.click(screen.getByText('Add barcode'));
    const input = screen.getByPlaceholderText('Scan or type the frame’s barcode');
    fireEvent.change(input, { target: { value: '400123' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText(/already a gift card/)).toBeTruthy());
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('Scan or type the frame’s barcode')).toBeNull();
  });

  it('shows the frame\'s history', async () => {
    historyResult = {
      data: [
        { id: 'h1', from_status: null, to_status: 'in_stock', reason: null, sale_id: null, refund_id: null,
          changed_at: '2026-11-01T10:00:00Z', changed_by_staff: { email: 'sam@shop.test' } },
        { id: 'h2', from_status: 'in_stock', to_status: 'retired', reason: 'Cracked throat', sale_id: null, refund_id: null,
          changed_at: '2026-11-02T10:00:00Z', changed_by_staff: null },
      ],
      error: null,
    };
    renderRow({ ...unit, status: 'sold' });
    expect(screen.queryByText('Retire')).toBeNull(); // a sold frame has no moves
    fireEvent.click(screen.getByText('History'));
    await waitFor(() => expect(screen.getByText('Received')).toBeTruthy());
    expect(screen.getByText('Retired').parentElement?.textContent).toContain('“Cracked throat”');
    expect(screen.getByText('Received').parentElement?.textContent).toContain('sam@shop.test');
  });
});
