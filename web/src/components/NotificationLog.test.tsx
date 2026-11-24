// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationRow } from '../lib/notifications';

const fetchNotifications = vi.fn();
const resendNotification = vi.fn();
vi.mock('../lib/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/notifications')>()),
  fetchNotifications: (...a: unknown[]) => fetchNotifications(...a),
  resendNotification: (...a: unknown[]) => resendNotification(...a),
}));

const sendQueuedMessagesQuietly = vi.fn();
vi.mock('../lib/sendNotifications', () => ({
  sendQueuedMessagesQuietly: (...a: unknown[]) => sendQueuedMessagesQuietly(...a),
}));

const { NotificationLog } = await import('./NotificationLog');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const row = (changes: Partial<NotificationRow>): NotificationRow => ({
  id: 'n1',
  kind: 'job_ready',
  channel: 'email',
  customer_id: 'c1',
  string_job_id: 'j1',
  sale_id: null,
  to_address: 'sam@example.com',
  subject: 'Ready',
  body: 'Hi',
  status: 'sent',
  error: null,
  attempts: 1,
  created_at: '2026-11-24T18:00:00Z',
  sending_at: null,
  finished_at: null,
  ...changes,
});

describe('NotificationLog', () => {
  it('lists messages with their status', async () => {
    fetchNotifications.mockResolvedValue([row({}), row({ id: 'n2', channel: 'sms', to_address: '+14155550123', status: 'skipped', error: "Texting isn't set up yet" })]);
    render(<NotificationLog filter={{ stringJobId: 'j1' }} />);
    expect(await screen.findByText('Ready notice · Email to sam@example.com')).toBeTruthy();
    expect(screen.getByText('Ready notice · Text to +14155550123')).toBeTruthy();
    expect(screen.getByText("Texting isn't set up yet")).toBeTruthy();
    expect(screen.getByText('Not sent')).toBeTruthy();
    expect(screen.getAllByText('Send again')).toHaveLength(1);
    expect(fetchNotifications).toHaveBeenCalledWith({ customerId: undefined, stringJobId: 'j1', saleId: undefined });
  });

  it('says when there are none', async () => {
    fetchNotifications.mockResolvedValue([]);
    render(<NotificationLog filter={{ customerId: 'c1' }} emptyText="Nothing sent." />);
    expect(await screen.findByText('Nothing sent.')).toBeTruthy();
  });

  it('sends a failed message again, then reloads', async () => {
    fetchNotifications.mockResolvedValue([row({ status: 'failed', error: 'Timed out', attempts: 2 })]);
    resendNotification.mockResolvedValue(undefined);
    sendQueuedMessagesQuietly.mockResolvedValue('Ready notice sent.');
    render(<NotificationLog filter={{ customerId: 'c1' }} />);
    expect(await screen.findByText(/2 tries/)).toBeTruthy();
    fireEvent.click(screen.getByText('Send again'));
    expect(await screen.findByText('Ready notice sent.')).toBeTruthy();
    expect(resendNotification).toHaveBeenCalledWith('n1');
    // Just this message, never the job's or the shop's whole queue (#9).
    expect(sendQueuedMessagesQuietly).toHaveBeenCalledWith({ notificationId: 'n1' }, 'Ready notice');
    await waitFor(() => expect(fetchNotifications).toHaveBeenCalledTimes(2));
  });

  it('sends a message again even when its job or sale was deleted', async () => {
    fetchNotifications.mockResolvedValue([row({ kind: 'receipt', string_job_id: null, sale_id: null, status: 'skipped' })]);
    resendNotification.mockResolvedValue(undefined);
    sendQueuedMessagesQuietly.mockResolvedValue(null);
    render(<NotificationLog filter={{ customerId: 'c1' }} />);
    fireEvent.click(await screen.findByText('Send again'));
    await waitFor(() => expect(sendQueuedMessagesQuietly).toHaveBeenCalledWith({ notificationId: 'n1' }, 'Receipt'));
  });

  it('offers Send again on a message left waiting, or stuck sending (#1)', async () => {
    fetchNotifications.mockResolvedValue([
      row({ id: 'w', status: 'queued' }),
      row({ id: 'stuck', status: 'sending', sending_at: '2026-11-24T18:00:00Z' }),
      row({ id: 'now', status: 'sending', sending_at: new Date().toISOString() }),
    ]);
    render(<NotificationLog filter={{ customerId: 'c1' }} />);
    expect(await screen.findByText('Waiting to send')).toBeTruthy();
    expect(screen.getAllByText('Send again')).toHaveLength(2);
  });

  it('shows why a message can\'t go again', async () => {
    fetchNotifications.mockResolvedValue([row({ status: 'failed' })]);
    resendNotification.mockRejectedValue(new Error('Sam has opted out of emails'));
    render(<NotificationLog filter={{ customerId: 'c1' }} />);
    fireEvent.click(await screen.findByText('Send again'));
    expect(await screen.findByText('Sam has opted out of emails')).toBeTruthy();
  });

  it('offers a retry when the log fails to load', async () => {
    fetchNotifications.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    render(<NotificationLog filter={{ customerId: 'c1' }} />);
    fireEvent.click(await screen.findByText('Retry'));
    expect(await screen.findByText('No messages yet.')).toBeTruthy();
  });
});
