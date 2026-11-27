// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rows = [
  { product_id: 'p1', racquet: 'Head Speed MP', loans: 3, led_to_sale: 1, conversion_pct: 33.3, returned: 2, retired: 1,
    avg_days_out: 3, out_now: 1, overdue_now: 1 },
  { product_id: 'p2', racquet: 'Zeta Speed 98', loans: 1, led_to_sale: 1, conversion_pct: 100, returned: 1, retired: 0,
    avg_days_out: 1.5, out_now: 0, overdue_now: 0 },
];
const rpc = vi.fn(async () => ({ data: rows, error: null }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => ({ range: () => rpc(...(args as [])) }) } }));
const download = vi.fn();
vi.mock('../../lib/csv', async (original) => ({ ...(await original<typeof import('../../lib/csv')>()), downloadCsv: (...args: unknown[]) => download(...args) }));

const { DemosReport } = await import('./DemosReport');
const range = { from: new Date(2026, 10, 1), to: new Date(2026, 11, 1) };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DemosReport', () => {
  it('shows each racquet with an overall conversion %, and saves CSV', async () => {
    render(<DemosReport range={range} />);
    expect(await screen.findByText('Head Speed MP')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('report_demos', { p_from: range.from.toISOString(), p_to: range.to.toISOString() });
    expect(within(screen.getByText('Total').closest('tr')!).getByText('50.0%')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download.mock.calls[0][0]).toBe('demo-program_2026-11-01_to_2026-11-30.csv');
    expect(download.mock.calls[0][1]).toContain('Zeta Speed 98,1,1,100,1,0,1.5,0,0\r\n');
    expect(download.mock.calls[0][1]).toContain('Total,4,2,50,3,1,,1,1\r\n');
  });
});
