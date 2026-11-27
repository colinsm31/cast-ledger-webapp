// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const recordMovement = vi.fn(async () => {});
vi.mock('../../lib/drawers', async (original) => ({
  ...(await original<typeof import('../../lib/drawers')>()),
  recordMovement: (...args: unknown[]) => recordMovement(...(args as [])),
}));

const { DrawerMovements } = await import('./DrawerMovements');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DrawerMovements', () => {
  it('lists what was recorded, "(no reason)" where none was typed', () => {
    render(
      <DrawerMovements
        sessionId="s-1"
        movements={[
          { id: 'm1', kind: 'paid_in', amount: 25, reason: 'Change from the bank', created_at: '2026-11-27T16:00:00Z' },
          { id: 'm2', kind: 'paid_out', amount: 6.5, reason: null, created_at: '2026-11-27T17:00:00Z' },
        ]}
        onRecorded={() => {}}
      />,
    );
    expect(screen.getByText('Change from the bank')).toBeTruthy();
    expect(screen.getByText('(no reason)')).toBeTruthy();
    expect(screen.getByText('$6.50')).toBeTruthy();
  });

  it('records a paid-in with an optional reason and clears the boxes', async () => {
    const onRecorded = vi.fn();
    render(<DrawerMovements sessionId="s-1" movements={[]} onRecorded={onRecorded} />);
    fireEvent.click(screen.getByRole('button', { name: 'Paid in' }));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Change from the bank' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record paid in' }));
    await waitFor(() => expect(onRecorded).toHaveBeenCalled());
    expect(recordMovement).toHaveBeenCalledWith('s-1', 'paid_in', 25, 'Change from the bank');
    expect((screen.getByLabelText('Amount') as HTMLInputElement).value).toBe('');
  });

  it('checks the amount and shows a refusal', async () => {
    render(<DrawerMovements sessionId="s-1" movements={[]} onRecorded={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Record paid out' }));
    expect(screen.getByText('Amount: enter an amount over $0, like 20.00.')).toBeTruthy();
    recordMovement.mockRejectedValueOnce(new Error('The drawer should only hold $10.00'));
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record paid out' }));
    expect(await screen.findByText('The drawer should only hold $10.00')).toBeTruthy();
  });
});
