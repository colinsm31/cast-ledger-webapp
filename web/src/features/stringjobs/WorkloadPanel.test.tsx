// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A fake `supabase.from().select().gte().lt()` returning `result`, noting the day asked for.
let result: { data: unknown; error: unknown } = { data: [], error: null };
const asked: string[] = [];
const query = {
  select: () => query,
  gte: (_column: string, value: string) => {
    asked.push(value);
    return query;
  },
  lt: async () => result,
};
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => query } }));

const { WorkloadPanel } = await import('./WorkloadPanel');

afterEach(cleanup);

// Thursday, Nov 20 2026, 10:00 local time.
const now = new Date(2026, 10, 20, 10, 0);
const at = (day: number, hours: number) => new Date(2026, 10, day, hours).toISOString();

describe('WorkloadPanel', () => {
  it('shows each stringer\'s load for today', async () => {
    result = { data: [{ strung_by: 'Alex', completed_at: at(20, 8) }], error: null };
    render(
      <WorkloadPanel
        now={now}
        waiting={[
          { assigned_to: 'Alex', promised_at: at(20, 9) },
          { assigned_to: null, promised_at: at(21, 9) },
        ]}
      />,
    );
    await waitFor(() => expect(screen.getByText('1', { selector: 'td:last-child' })).toBeTruthy());
    const alex = screen.getByText('Alex').closest('tr') as HTMLElement;
    expect(within(alex).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Alex', '1', '1', '1', '1']);
    const unassigned = screen.getByText('Unassigned').closest('tr') as HTMLElement;
    expect(within(unassigned).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Unassigned', '1', '0', '0', '0']);
    expect(screen.getByText('Today')).toBeTruthy();
  });

  it('moves between days and reads that day\'s finished jobs', async () => {
    result = { data: [], error: null };
    asked.length = 0;
    render(<WorkloadPanel now={now} waiting={[]} />);
    expect(screen.getByText('Nothing waiting or finished.')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Previous day'));
    expect(screen.getByText('Yesterday')).toBeTruthy();
    await waitFor(() => expect(asked).toContain(new Date(2026, 10, 19).toISOString()));
  });

  it('says when the finished jobs can\'t be read', async () => {
    result = { data: null, error: { message: 'offline' } };
    render(<WorkloadPanel now={now} waiting={[]} />);
    await waitFor(() => expect(screen.getByText(/Couldn.t load the finished jobs/)).toBeTruthy());
  });
});
