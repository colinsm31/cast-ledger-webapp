// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn(async (..._args: unknown[]) => ({ data: 'loan-1' as string | null, error: null as unknown }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));
vi.mock('../../lib/settings', () => ({ useSettings: () => ({ settings: { demo_loan_days: 3 }, error: null, reload: () => {} }) }));
vi.mock('../../lib/customerSearch', () => ({
  useCustomerMatches: (query: string) => ({
    matches: query === 'pat' ? [{ id: 'c1', first_name: 'Pat', last_name: 'Tester', phone_number: '(225)555-0100' }] : [],
    searching: query === 'pa',
  }),
}));

const { LendDemoForm } = await import('./LendDemoForm');

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

describe('LendDemoForm', () => {
  it('lends the frame to the picked customer with a deposit note', async () => {
    const onLent = vi.fn();
    render(<LendDemoForm unitId="u1" onLent={onLent} onCancel={vi.fn()} />);
    const lend = screen.getByText('Lend demo') as HTMLButtonElement;
    expect(lend.disabled).toBe(true); // nobody picked yet

    fireEvent.change(screen.getByPlaceholderText(/search customer/), { target: { value: 'pat' } });
    fireEvent.click(screen.getByText('Tester, Pat'));
    fireEvent.change(screen.getByPlaceholderText(/card on file/), { target: { value: ' Card on file ' } });
    fireEvent.click(screen.getByText('Lend demo'));

    await waitFor(() => expect(onLent).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith(
      'check_out_demo',
      expect.objectContaining({ p_unit_id: 'u1', p_customer_id: 'c1', p_deposit_note: 'Card on file', p_note: null }),
    );
    const due = new Date((rpc.mock.calls[0][1] as { p_due_back_at: string }).p_due_back_at).getTime();
    expect(Math.abs(due - (Date.now() + 3 * 24 * 60 * 60 * 1000))).toBeLessThan(2 * 60 * 1000);
  });

  it('says what the database refused', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'This frame is already out on demo' } });
    render(<LendDemoForm unitId="u1" onLent={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search customer/), { target: { value: 'pat' } });
    fireEvent.click(screen.getByText('Tester, Pat'));
    fireEvent.click(screen.getByText('Lend demo'));
    expect(await screen.findByText('This frame is already out on demo')).toBeTruthy();
  });

  it('says it\'s searching rather than "No matches" while the lookup runs', () => {
    render(<LendDemoForm unitId="u1" onLent={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/search customer/), { target: { value: 'pa' } });
    expect(screen.getByText('Searching…')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/search customer/), { target: { value: 'zz' } });
    expect(screen.getByText('No matches.')).toBeTruthy();
  });

  it('keeps the due date clear once staff clear it to type their own', () => {
    render(<LendDemoForm unitId="u1" onLent={vi.fn()} onCancel={vi.fn()} />);
    const due = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    expect(due.value).not.toBe('');
    fireEvent.change(due, { target: { value: '' } });
    expect(due.value).toBe('');
  });
});
