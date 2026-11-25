// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inventoryByGroup, type InventoryValueRow } from './inventoryValue';

const item = (over: Partial<InventoryValueRow>): InventoryValueRow => ({
  product_id: 'p', product: 'P', category: 'Strings', brand: 'Head', is_serialized: false, on_hand: 1, cost: 2,
  sell_price: 5, value_at_cost: 2, retail_value: 5, demo_frames: 0, demo_value_at_cost: null, ...over,
});
const rows = [
  item({ product_id: 'p1', product: 'Head String', on_hand: 10, value_at_cost: 80, retail_value: 200 }),
  item({ product_id: 'p2', product: 'Grip', brand: null, cost: null, on_hand: 3, value_at_cost: null, retail_value: 27 }),
  item({ product_id: 'p3', product: 'Head Speed', category: 'Racquets', is_serialized: true, on_hand: 2, cost: 150,
         value_at_cost: 300, retail_value: 500, demo_frames: 2, demo_value_at_cost: 300 }),
];
const rpc = vi.fn(async () => ({ data: rows, error: null }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...(args as [])) } }));
const download = vi.fn();
vi.mock('../../lib/csv', async (original) => ({ ...(await original<typeof import('../../lib/csv')>()), downloadCsv: (...args: unknown[]) => download(...args) }));

const { InventoryValueReport } = await import('./InventoryValueReport');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('inventoryByGroup', () => {
  it('adds products up by category, most valuable first, counting those without a cost', () => {
    expect(inventoryByGroup(rows, 'category')).toEqual([
      { name: 'Racquets', products: 1, on_hand: 2, value_at_cost: 300, retail_value: 500, without_cost: 0, demo_frames: 2, demo_value_at_cost: 300 },
      { name: 'Strings', products: 2, on_hand: 13, value_at_cost: 80, retail_value: 227, without_cost: 1, demo_frames: 0, demo_value_at_cost: 0 },
    ]);
  });
  it('names a missing brand', () => {
    expect(inventoryByGroup(rows, 'brand').map((g) => g.name)).toEqual(['Head', '(no brand)']);
  });
});

describe('InventoryValueReport', () => {
  it('shows value by category, then by product, with CSV', async () => {
    render(<InventoryValueReport />);
    expect(await screen.findByText('Racquets')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('report_inventory_value', {});
    expect(within(screen.getByText('Total').closest('tr')!).getByText('$380.00')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'product' } });
    expect(screen.getByText('Grip')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download.mock.calls[0][0]).toBe('inventory-value-by-product.csv');
    expect(download.mock.calls[0][1]).toContain('Grip,Strings,3,,,27,0,\r\n');
    expect(download.mock.calls[0][1]).toContain('Total,,15,,380,727,2,300\r\n');
  });
});
