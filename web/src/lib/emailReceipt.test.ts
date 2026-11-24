import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const update = vi.fn();
const eq = vi.fn();
vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    from: () => ({ update: (...a: unknown[]) => (update(...a), { eq: (...b: unknown[]) => eq(...b) }) }),
  },
}));
const sendQueuedMessagesQuietly = vi.fn();
vi.mock('./sendNotifications', () => ({
  sendQueuedMessagesQuietly: (...a: unknown[]) => sendQueuedMessagesQuietly(...a),
}));

const { browserTimeZone, emailReceipt, saveCustomerEmail } = await import('./emailReceipt');

describe('emailReceipt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends only the sale, the address and the time zone; the server builds the email (#2)', async () => {
    rpc.mockResolvedValue({ data: 'n1', error: null });
    sendQueuedMessagesQuietly.mockResolvedValue('Receipt sent.');
    expect(await emailReceipt('s1', ' pat@example.com ')).toBe('Receipt sent.');
    expect(rpc).toHaveBeenCalledWith('queue_receipt_email', {
      p_sale_id: 's1',
      p_to: 'pat@example.com',
      p_time_zone: browserTimeZone() ?? null,
    });
    // Just this email, not the sale's other queued messages.
    expect(sendQueuedMessagesQuietly).toHaveBeenCalledWith({ notificationId: 'n1' }, 'Receipt');
  });

  it('knows the browser\'s time zone, or none', () => {
    expect(browserTimeZone()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new Error('no Intl');
    });
    expect(browserTimeZone()).toBeUndefined();
    spy.mockRestore();
  });

  it('says it is queued when the sender reports nothing', async () => {
    rpc.mockResolvedValue({ data: 'n1', error: null });
    sendQueuedMessagesQuietly.mockResolvedValue(null);
    expect(await emailReceipt('s1', 'pat@example.com')).toBe('Receipt queued.');
  });

  it('throws when the database refuses it', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('This receipt was already emailed 5 times in the last hour') });
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
