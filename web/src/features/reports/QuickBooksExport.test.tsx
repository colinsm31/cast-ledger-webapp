// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dayTotals, journalCsv, journalNumber, wholeDays, type JournalLine } from './quickbooks';

const lines: JournalLine[] = [
  { day: '2026-11-10', line_no: 1, account: 'Undeposited Funds', debit: 54.13, credit: null, memo: 'Cash' },
  { day: '2026-11-10', line_no: 2, account: 'Sales', debit: null, credit: 50, memo: 'Sales: Strings' },
  { day: '2026-11-10', line_no: 3, account: 'Sales Tax Payable', debit: null, credit: 4.13, memo: 'Sales tax' },
  { day: '2026-11-11', line_no: 1, account: 'Undeposited Funds', debit: 55, credit: null, memo: 'Card' },
  { day: '2026-11-11', line_no: 2, account: 'Gift Card Liability, Main', debit: null, credit: 55, memo: 'Gift cards sold' },
];
const rpc = vi.fn(async () => ({ data: lines, error: null }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => ({ range: () => rpc(...(args as [])) }) } }));
const download = vi.fn();
vi.mock('../../lib/csv', async (original) => ({ ...(await original<typeof import('../../lib/csv')>()), downloadCsv: (...args: unknown[]) => download(...args) }));

const { QuickBooksExport } = await import('./QuickBooksExport');
// A past month, so the whole of it can be exported.
const range = { from: new Date(2026, 9, 1), to: new Date(2026, 10, 1) };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('journal helpers', () => {
  it('numbers each day’s entry', () => {
    expect(journalNumber('2026-11-05')).toBe('AS-20261105');
  });
  it('writes a journal import file', () => {
    expect(journalCsv(lines.slice(3))).toBe(
      'Journal No,Journal Date,Account,Debits,Credits,Description\r\n' +
        'AS-20261111,2026-11-11,Undeposited Funds,55.00,,Card\r\n' +
        'AS-20261111,2026-11-11,"Gift Card Liability, Main",,55.00,Gift cards sold\r\n',
    );
  });
  it('totals each day', () => {
    expect(dayTotals(lines)).toEqual([
      { day: '2026-11-10', debits: 54.13, credits: 54.13 },
      { day: '2026-11-11', debits: 55, credits: 55 },
    ]);
  });
});

describe('wholeDays', () => {
  const now = new Date(2026, 10, 25, 15, 30);
  it('stops a period at the start of today', () => {
    expect(wholeDays({ from: new Date(2026, 10, 1), to: new Date(2026, 10, 26) }, now)).toEqual({
      from: new Date(2026, 10, 1),
      to: new Date(2026, 10, 25),
    });
  });
  it('leaves a past period alone, and has nothing for today alone', () => {
    expect(wholeDays(range, now)).toEqual(range);
    expect(wholeDays({ from: new Date(2026, 10, 25), to: new Date(2026, 10, 26) }, now)).toBeNull();
    expect(wholeDays(null, now)).toBeNull();
  });
});

describe('QuickBooksExport', () => {
  it('shows each day’s entry in the browser’s time zone and downloads it', async () => {
    render(<QuickBooksExport range={range} />);
    expect(await screen.findByText('2 days, one journal entry each.')).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('report_daily_summary', {
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
      p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(screen.getByText('AS-20261110 · 2026-11-10')).toBeTruthy();
    expect(screen.queryByText(/don.t match/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    expect(download.mock.calls[0][0]).toBe('quickbooks-daily-summary_2026-10-01_to_2026-10-31.csv');
  });

  it('says today can be exported tomorrow', () => {
    const today = new Date();
    const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    render(<QuickBooksExport range={{ from: midnight, to: new Date(midnight.getFullYear(), midnight.getMonth(), midnight.getDate() + 1) }} />);
    expect(screen.getByText(/Export it tomorrow/)).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('warns about a day that doesn’t balance', async () => {
    rpc.mockResolvedValueOnce({ data: lines.slice(0, 2), error: null });
    render(<QuickBooksExport range={range} />);
    expect(await screen.findByText(/match on 2026-11-10/)).toBeTruthy();
  });

  it('says when there’s nothing to export, and shows a failure with Retry', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    render(<QuickBooksExport range={range} />);
    expect(await screen.findByText('No sales or refunds in this period.')).toBeTruthy();
    cleanup();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Unknown time zone: X' } } as never);
    render(<QuickBooksExport range={range} />);
    expect(await screen.findByText(/Unknown time zone: X/)).toBeTruthy();
  });
});
