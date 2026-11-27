// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { totalsByPerson, type PriceChangeRow } from './priceChanges';

const rows: PriceChangeRow[] = [
  { kind: 'line_discount', sold_at: '2026-11-10T12:00:00Z', sale_id: 's1', made_by: 'staff@shop.test', approved_by: null,
    item: 'Test String', qty: 2, from_price: 25, to_price: 20, amount: 10, reason: '(none)' },
  { kind: 'price_change', sold_at: '2026-11-10T12:00:00Z', sale_id: 's1', made_by: 'staff@shop.test', approved_by: null,
    item: 'Overgrip', qty: 1, from_price: 12, to_price: 10, amount: 2, reason: 'Scuffed' },
  { kind: 'ticket_discount', sold_at: '2026-11-11T15:00:00Z', sale_id: 's2', made_by: 'staff@shop.test', approved_by: 'admin@shop.test',
    item: 'Stringing', qty: 1, from_price: 33, to_price: 30, amount: 3, reason: 'Loyal customer' },
  { kind: 'payment_type_change', sold_at: '2026-11-12T10:00:00Z', sale_id: 's1', made_by: 'admin@shop.test', approved_by: null,
    item: 'Refund paid by cash', qty: null, from_price: null, to_price: null, amount: null, reason: '(none)' },
];
const rpc = vi.fn(async () => ({ data: rows, error: null }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => ({ range: () => rpc(...(args as [])) }) } }));
const download = vi.fn();
vi.mock('../../lib/csv', async (original) => ({ ...(await original<typeof import('../../lib/csv')>()), downloadCsv: (...args: unknown[]) => download(...args) }));

const { PriceChangesReport } = await import('./PriceChangesReport');
const range = { from: new Date(2026, 10, 1), to: new Date(2026, 11, 1) };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('totalsByPerson', () => {
  it('counts changes for who made them and approvals for who approved them', () => {
    expect(totalsByPerson(rows)).toEqual([
      { person: 'admin@shop.test', price_changes: 0, price_change_total: 0, discounts: 0, discount_total: 0, approvals: 1, approved_total: 3, payment_type_changes: 1 },
      { person: 'staff@shop.test', price_changes: 1, price_change_total: 2, discounts: 2, discount_total: 13, approvals: 0, approved_total: 0, payment_type_changes: 0 },
    ]);
  });
});

describe('PriceChangesReport', () => {
  it('opens on the per-person totals', async () => {
    render(<PriceChangesReport range={range} />);
    expect(await screen.findByText('admin@shop.test')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('report_price_changes', { p_from: range.from.toISOString(), p_to: range.to.toISOString() });
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download.mock.calls[0][0]).toBe('discounts-by-person_2026-11-01_to_2026-11-30.csv');
    expect(download.mock.calls[0][1]).toContain('staff@shop.test,1,2.00,2,13.00,0,0.00,0\r\n');
  });

  it('lists every change with its reason, "(none)" included', async () => {
    render(<PriceChangesReport range={range} />);
    await screen.findByText('admin@shop.test');
    fireEvent.click(screen.getByRole('button', { name: 'Every change' }));
    expect(screen.getAllByText('(none)')).toHaveLength(2);
    expect(screen.getByText('Refund paid differently')).toBeTruthy();
    expect(screen.getByText('Ticket discount')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    const text = download.mock.calls[0][1] as string;
    expect(text).toContain('When,Type,Item,Qty,From,To,Taken off,Made by,Ticket approved by,Reason,Ticket ID\r\n');
    expect(text).toContain(',Price change,Overgrip,1,12.00,10.00,2.00,staff@shop.test,,Scuffed,s1\r\n');
    expect(text).toContain('Total,,,,,,15.00,,,,\r\n');
    expect(text).toContain(',Refund paid differently,Refund paid by cash,,,,,admin@shop.test,,(none),s1\r\n');
  });
});
