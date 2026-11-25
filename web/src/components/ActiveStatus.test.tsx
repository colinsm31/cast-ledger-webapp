// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ActiveStatusPanel, InactiveBadge } from './ActiveStatus';
import { inactiveGiftCardMessage } from '../types/domain';

afterEach(cleanup);

describe('ActiveStatusPanel', () => {
  it('makes an active record inactive, with or without a reason', async () => {
    const setActive = vi.fn().mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<ActiveStatusPanel noun="gift card" isActive deactivation={{}} setActive={setActive} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make this gift card inactive…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make inactive' }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith(false, null));

    fireEvent.click(screen.getByRole('button', { name: 'Make this gift card inactive…' }));
    fireEvent.change(screen.getByLabelText('Why is this gift card inactive? (optional)'), { target: { value: ' Lost ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make inactive' }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith(false, 'Lost'));
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('shows why a record is inactive and turns it back on', async () => {
    const setActive = vi.fn().mockResolvedValue(undefined);
    render(
      <ActiveStatusPanel
        noun="customer"
        isActive={false}
        deactivation={{ deactivated_reason: 'Moved away', deactivated_at: '2026-11-20T12:00:00Z' }}
        setActive={setActive}
        onChanged={() => {}}
      />,
    );
    expect(screen.getByText(/Moved away/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make active again' }));
    await waitFor(() => expect(setActive).toHaveBeenCalledWith(true, null));
  });

  it('can be cancelled, and shows the inactive badge', () => {
    render(
      <>
        <InactiveBadge />
        <ActiveStatusPanel noun="customer" isActive deactivation={{}} setActive={vi.fn()} onChanged={() => {}} />
      </>,
    );
    expect(screen.getByText('Inactive')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Make this customer inactive…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Make this customer inactive…' })).toBeTruthy();
  });

  it('keeps a reason to 200 characters', () => {
    const setActive = vi.fn();
    render(<ActiveStatusPanel noun="customer" isActive deactivation={{}} setActive={setActive} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make this customer inactive…' }));
    fireEvent.change(screen.getByLabelText('Why is this customer inactive? (optional)'), { target: { value: 'x'.repeat(201) } });
    fireEvent.click(screen.getByRole('button', { name: 'Make inactive' }));
    expect(screen.getByText('Keep the reason to 200 characters.')).toBeTruthy();
    expect(setActive).not.toHaveBeenCalled();
  });

  it('shows what the database refused', async () => {
    const setActive = vi.fn().mockRejectedValue(new Error('This customer has a string job open'));
    render(<ActiveStatusPanel noun="customer" isActive deactivation={{}} setActive={setActive} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Make this customer inactive…' }));
    fireEvent.change(screen.getByLabelText('Why is this customer inactive? (optional)'), { target: { value: 'Duplicate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Make inactive' }));
    expect(await screen.findByText('This customer has a string job open')).toBeTruthy();
  });
});

describe('inactiveGiftCardMessage', () => {
  it('words the refusal as the database does', () => {
    expect(inactiveGiftCardMessage('GC-1')).toBe("Gift card GC-1 is inactive, so it can't be used: make it active again first.");
  });
});
