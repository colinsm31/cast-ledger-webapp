// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const emailReceipt = vi.fn();
const saveCustomerEmail = vi.fn();
vi.mock('../../lib/emailReceipt', () => ({
  emailReceipt: (...a: unknown[]) => emailReceipt(...a),
  saveCustomerEmail: (...a: unknown[]) => saveCustomerEmail(...a),
}));

const { EmailReceiptForm } = await import('./EmailReceiptForm');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const address = () => screen.getByLabelText('Email address') as HTMLInputElement;

describe('EmailReceiptForm', () => {
  it("starts from the customer's address and sends", async () => {
    emailReceipt.mockResolvedValue('Receipt sent.');
    const onSent = vi.fn();
    render(<EmailReceiptForm saleId="s1" customer={{ id: 'c1', email: 'pat@example.com' }} onSent={onSent} onCancel={vi.fn()} />);
    expect(address().value).toBe('pat@example.com');
    expect(screen.queryByText('Save this address to the customer')).toBeNull();
    fireEvent.click(screen.getByText('Send receipt'));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith('Receipt sent.'));
    expect(emailReceipt).toHaveBeenCalledWith('s1', 'pat@example.com');
    expect(saveCustomerEmail).not.toHaveBeenCalled();
  });

  it('can keep a new address on the customer', async () => {
    emailReceipt.mockResolvedValue('Receipt sent.');
    saveCustomerEmail.mockResolvedValue(undefined);
    const onSent = vi.fn();
    render(<EmailReceiptForm saleId="s1" customer={{ id: 'c1', email: null }} onSent={onSent} onCancel={vi.fn()} />);
    fireEvent.change(address(), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByLabelText('Save this address to the customer'));
    fireEvent.click(screen.getByText('Send receipt'));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith('Receipt sent.'));
    expect(saveCustomerEmail).toHaveBeenCalledWith('c1', 'new@example.com');
  });

  it("says when the address couldn't be saved, but the receipt still went", async () => {
    emailReceipt.mockResolvedValue('Receipt sent.');
    saveCustomerEmail.mockRejectedValue(new Error('denied'));
    const onSent = vi.fn();
    render(<EmailReceiptForm saleId="s1" customer={{ id: 'c1', email: 'old@example.com' }} onSent={onSent} onCancel={vi.fn()} />);
    fireEvent.change(address(), { target: { value: 'new@example.com' } });
    fireEvent.click(screen.getByLabelText('Save this address to the customer'));
    fireEvent.click(screen.getByText('Send receipt'));
    await waitFor(() =>
      expect(onSent).toHaveBeenCalledWith("Receipt sent. The address wasn't saved to the customer: denied"),
    );
  });

  it('checks the address, and shows a refusal', async () => {
    render(<EmailReceiptForm saleId="s1" customer={null} onSent={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(address(), { target: { value: 'nope' } });
    fireEvent.click(screen.getByText('Send receipt'));
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(emailReceipt).not.toHaveBeenCalled();

    emailReceipt.mockRejectedValue(new Error('This receipt was already emailed 5 times in the last hour'));
    fireEvent.change(address(), { target: { value: 'pat@example.com' } });
    fireEvent.click(screen.getByText('Send receipt'));
    expect(await screen.findByText(/5 times/)).toBeTruthy();
  });
});
