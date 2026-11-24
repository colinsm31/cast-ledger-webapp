import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeEdgeFunction = vi.fn();
vi.mock('./edgeFunctions', () => ({ invokeEdgeFunction: (...a: unknown[]) => invokeEdgeFunction(...a) }));

const { sendQueuedMessages, sendQueuedMessagesQuietly, sendSummaryText } = await import('./sendNotifications');

const summary = (sent: number, failed: number, skipped: number, error?: string) => ({
  sent,
  failed,
  skipped,
  results: [{ id: 'n1', status: sent ? 'sent' : failed ? 'failed' : 'skipped', ...(error ? { error } : {}) }] as never,
});

describe('sendQueuedMessages', () => {
  beforeEach(() => invokeEdgeFunction.mockReset());

  it('asks the function for one job or one sale', async () => {
    invokeEdgeFunction.mockResolvedValue(summary(1, 0, 0));
    await sendQueuedMessages({ stringJobId: 'j1' });
    expect(invokeEdgeFunction).toHaveBeenCalledWith('send-notifications', { string_job_id: 'j1' });
    await sendQueuedMessages({ saleId: 's1' });
    expect(invokeEdgeFunction).toHaveBeenCalledWith('send-notifications', { sale_id: 's1' });
  });

  it('never throws when sent quietly', async () => {
    invokeEdgeFunction.mockRejectedValue(new Error('Failed to fetch'));
    expect(await sendQueuedMessagesQuietly({ stringJobId: 'j1' })).toBe(
      "The message is queued but wasn't sent: Failed to fetch. Use Send again in the message log.",
    );
    invokeEdgeFunction.mockResolvedValue(summary(1, 0, 0));
    expect(await sendQueuedMessagesQuietly({ saleId: 's1' }, 'Receipt')).toBe('Receipt sent.');
  });
});

describe('sendSummaryText', () => {
  it('says nothing when nothing was queued', () => {
    expect(sendSummaryText({ sent: 0, failed: 0, skipped: 0, results: [] })).toBeNull();
  });
  it('names one message and its reason', () => {
    expect(sendSummaryText(summary(1, 0, 0))).toBe('Ready message sent.');
    expect(sendSummaryText(summary(0, 1, 0, 'Invalid address'))).toBe('Ready message failed: Invalid address');
    expect(sendSummaryText(summary(0, 0, 1, "Texting isn't set up yet"))).toBe(
      "Ready message not sent: Texting isn't set up yet",
    );
    expect(sendSummaryText(summary(0, 0, 1))).toBe('Ready message not sent.');
  });
  it('counts several', () => {
    expect(sendSummaryText({ sent: 1, failed: 1, skipped: 1, results: [] })).toBe(
      'Ready messages: 1 sent, 1 failed, 1 not sent.',
    );
  });
});
