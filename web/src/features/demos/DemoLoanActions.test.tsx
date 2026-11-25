// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn(async (..._args: unknown[]) => ({ data: 'demo' as string | null, error: null as unknown }));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const { DemoLoanActions } = await import('./DemoLoanActions');

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

const loan = { id: 'l1', due_back_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() };

describe('DemoLoanActions', () => {
  it('checks a demo back into the demo fleet', async () => {
    const onChanged = vi.fn();
    render(<DemoLoanActions loan={loan} onChanged={onChanged} />);
    fireEvent.click(screen.getByText('Check in'));
    fireEvent.click(screen.getAllByText('Check in').find((el) => el.className.includes('bg-blue')) as HTMLElement);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('check_in_demo', { p_loan_id: 'l1', p_status: 'demo', p_reason: null });
  });

  it('retires a damaged demo, with or without a reason', async () => {
    render(<DemoLoanActions loan={loan} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByText('Check in'));
    fireEvent.click(screen.getByLabelText('Damaged: retire it'));
    const confirm = screen.getAllByText('Check in').find((el) => el.className.includes('bg-blue')) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false); // no reason needed
    fireEvent.change(screen.getByPlaceholderText(/cracked throat/), { target: { value: 'Cracked throat' } });
    fireEvent.click(screen.getAllByText('Check in').find((el) => el.className.includes('bg-blue')) as HTMLElement);
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('check_in_demo', { p_loan_id: 'l1', p_status: 'retired', p_reason: 'Cracked throat' }),
    );
  });

  it('gives a loan a new due date', async () => {
    const onChanged = vi.fn();
    render(<DemoLoanActions loan={loan} onChanged={onChanged} />);
    fireEvent.click(screen.getByText('Change due date'));
    fireEvent.click(screen.getByText('Save due date'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('set_demo_due', expect.objectContaining({ p_loan_id: 'l1' }));
  });

  it('shows a refusal and can be cancelled', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Demo D1001 has already been checked in' } });
    render(<DemoLoanActions loan={loan} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByText('Check in'));
    fireEvent.click(screen.getAllByText('Check in').find((el) => el.className.includes('bg-blue')) as HTMLElement);
    expect(await screen.findByText('Demo D1001 has already been checked in')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText('Change due date')).toBeTruthy();
  });
});
