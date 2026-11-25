// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const summary = {
  jobs_entered: 3, rush_entered: 1, jobs_completed: 2, jobs_delivered: 0, jobs_cancelled: 1, jobs_waiting: 1,
  revenue: 30, strings_revenue: 20, labor_revenue: 10, refunds: 30, net_revenue: 0,
};
const stringers = [{ stringer: 'Sam', jobs_completed: 2, rush: 1, customer_supplied: 1, on_time: 1, late: 1, avg_hours: 48.5 }];
const rpc = vi.fn(async (fn: string) =>
  fn === 'report_stringing_summary' ? { data: [summary], error: null } : { data: stringers, error: null },
);
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...(args as [string])) } }));
const download = vi.fn();
vi.mock('../../lib/csv', async (original) => ({ ...(await original<typeof import('../../lib/csv')>()), downloadCsv: (...args: unknown[]) => download(...args) }));

const { StringingReport } = await import('./StringingReport');
const range = { from: new Date(2026, 10, 1), to: new Date(2026, 11, 1) };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('StringingReport', () => {
  it('shows the period’s jobs and revenue, and each stringer', async () => {
    render(<StringingReport range={range} />);
    expect(await screen.findByText('Sam')).toBeTruthy();
    expect(screen.getByText('Net stringing revenue')).toBeTruthy();
    expect(screen.getByText('48.5')).toBeTruthy();
  });

  it('saves the summary and the stringers as CSV', async () => {
    render(<StringingReport range={range} />);
    await screen.findByText('Sam');
    const [summaryButton, stringerButton] = screen.getAllByRole('button', { name: 'Download CSV' });
    fireEvent.click(summaryButton);
    expect(download.mock.calls[0][0]).toBe('stringing-summary_2026-11-01_to_2026-11-30.csv');
    expect(download.mock.calls[0][1]).toContain('Jobs taken in,3\r\n');
    expect(download.mock.calls[0][1]).toContain('Of it strings,20\r\n');
    fireEvent.click(stringerButton);
    expect(download.mock.calls[1][1]).toContain("Stringer,Jobs completed,Rush,Customer's own string,On time,Late,Average hours\r\nSam,2,1,1,1,1,48.5\r\n");
  });

  it('shows a failed summary with Retry', async () => {
    rpc.mockImplementationOnce(async () => ({ data: null, error: { message: 'boom' } }) as never);
    render(<StringingReport range={range} />);
    expect(await screen.findByText(/Couldn't load the report: boom/)).toBeTruthy();
  });
});
