// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminApprovalDialog } from './AdminApprovalDialog';

afterEach(cleanup);

function renderDialog(approve: (c: { email: string; password: string }) => Promise<string>) {
  const onApproved = vi.fn();
  const onCancel = vi.fn();
  render(
    <AdminApprovalDialog
      message="Refunding a gift card load needs an admin."
      approveLabel="Approve refund"
      approve={approve}
      onApproved={onApproved}
      onCancel={onCancel}
    />,
  );
  return { onApproved, onCancel };
}

describe('AdminApprovalDialog', () => {
  it('passes the admin’s sign-in to approve and hands back the approval', async () => {
    const approve = vi.fn().mockResolvedValue('approval-1');
    const { onApproved } = renderDialog(approve);
    expect(screen.getByText('Refunding a gift card load needs an admin.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Admin email'), { target: { value: 'admin@shop.test' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve refund' }));
    await waitFor(() => expect(onApproved).toHaveBeenCalledWith('approval-1'));
    expect(approve).toHaveBeenCalledWith({ email: 'admin@shop.test', password: 'pw' });
  });

  it('shows why an approval failed, and cancels', async () => {
    const { onApproved, onCancel } = renderDialog(() => Promise.reject(new Error('That email and password didn’t work.')));
    fireEvent.click(screen.getByRole('button', { name: 'Approve refund' }));
    expect(await screen.findByText('That email and password didn’t work.')).toBeTruthy();
    expect(onApproved).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
