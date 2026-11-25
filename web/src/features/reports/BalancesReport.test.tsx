// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rows = [
  { kind: 'gift_card', holder_id: 'g1', code: 'GC-1', customer: 'Tester, Pat', balance: 30, last_activity: '2026-11-15T10:00:00Z', is_active: true },
  { kind: 'gift_card', holder_id: 'g2', code: 'GC-2', customer: null, balance: 10, last_activity: null, is_active: false },
  { kind: 'store_credit', holder_id: 'c2', code: null, customer: 'Able, Ann', balance: 15, last_activity: '2026-11-05T10:00:00Z', is_active: true },
];
const rpc = vi.fn(async () => ({ data: rows, error: null }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => ({ range: () => rpc(...(args as [])) }) } }));
const download = vi.fn();
vi.mock('../../lib/csv', async (original) => ({ ...(await original<typeof import('../../lib/csv')>()), downloadCsv: (...args: unknown[]) => download(...args) }));

const { BalancesReport } = await import('./BalancesReport');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BalancesReport', () => {
  it('shows what is owed at the end of today, gift cards and store credit apart', async () => {
    render(<BalancesReport />);
    expect(await screen.findByText('GC-1')).toBeTruthy();
    const now = new Date();
    expect(rpc).toHaveBeenCalledWith('report_balances', {
      p_as_of: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString(),
    });
    expect(screen.getByText('$40.00')).toBeTruthy();
    expect(screen.getByText('$15.00', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('reports another day and saves it as CSV', async () => {
    render(<BalancesReport />);
    await screen.findByText('GC-1');
    fireEvent.change(screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/), { target: { value: '2026-11-30' } });
    expect(rpc).toHaveBeenLastCalledWith('report_balances', { p_as_of: new Date(2026, 11, 1).toISOString() });
    await screen.findByText('GC-1');
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download.mock.calls[0][0]).toBe('balances-owed-2026-11-30.csv');
    expect(download.mock.calls[0][1]).toContain('Gift card,GC-2,,10,,No\r\n');
    expect(download.mock.calls[0][1]).toContain('Total,,,55,,\r\n');
  });

  it('asks for a day when the box is cleared', async () => {
    render(<BalancesReport />);
    await screen.findByText('GC-1');
    fireEvent.change(screen.getByDisplayValue(/\d{4}-\d{2}-\d{2}/), { target: { value: '' } });
    expect(screen.getByText('Choose a day.')).toBeTruthy();
  });
});
