import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Receipt } from './receipt';

const rpc = vi.fn();
const update = vi.fn();
const eq = vi.fn();
vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ update: (...a: unknown[]) => (update(...a), { eq: (...b: unknown[]) => eq(...b) }) }),
  },
}));
const receipt = { number: 'ABC' } as Receipt;
vi.mock('./receipt', () => ({ fetchReceipt: async () => receipt }));
vi.mock('./receiptEmail', () => ({
  receiptEmailHtml: () => '<p>html</p>',
  receiptEmailText: () => 'text',
}));
const sendQueuedMessagesQuietly = vi.fn();
vi.mock('./sendNotifications', () => ({
  sendQueuedMessagesQuietly: (...a: unknown[]) => sendQueuedMessagesQuietly(...a),
}));

const { emailReceipt, saveCustomerEmail } = await import('./emailReceipt');

describe('emailReceipt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queues the drawn receipt, then sends it', async () => {
    rpc.mockResolvedValue({ error: null });
    sendQueuedMessagesQuietly.mockResolvedValue('Receipt sent.');
    expect(await emailReceipt('s1', ' pat@example.com ')).toBe('Receipt sent.');
    expect(rpc).toHaveBeenCalledWith('queue_receipt_email', {
      p_sale_id: 's1',
      p_to: 'pat@example.com',
      p_html: '<p>html</p>',
      p_text: 'text',
    });
    expect(sendQueuedMessagesQuietly).toHaveBeenCalledWith({ saleId: 's1' }, 'Receipt');
  });

  it('says it is queued when the sender reports nothing', async () => {
    rpc.mockResolvedValue({ error: null });
    sendQueuedMessagesQuietly.mockResolvedValue(null);
    expect(await emailReceipt('s1', 'pat@example.com')).toBe('Receipt queued.');
  });

  it('throws when the database refuses it', async () => {
    rpc.mockResolvedValue({ error: new Error('This receipt was already emailed 5 times in the last hour') });
    await expect(emailReceipt('s1', 'pat@example.com')).rejects.toThrow('5 times');
    expect(sendQueuedMessagesQuietly).not.toHaveBeenCalled();
  });
});

describe('saveCustomerEmail', () => {
  it('updates the customer, throwing its error', async () => {
    eq.mockResolvedValue({ error: null });
    await saveCustomerEmail('c1', ' pat@example.com ');
    expect(update).toHaveBeenCalledWith({ email: 'pat@example.com' });
    expect(eq).toHaveBeenCalledWith('id', 'c1');
    eq.mockResolvedValue({ error: new Error('denied') });
    await expect(saveCustomerEmail('c1', 'x@y.co')).rejects.toThrow('denied');
  });
});
