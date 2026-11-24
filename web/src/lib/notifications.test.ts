import { describe, expect, it, vi } from 'vitest';

// A fake supabase query that records its filters and returns `result`.
const calls: unknown[][] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };
let rpcError: unknown = null;
const query = {
  select: (...a: unknown[]) => (calls.push(['select', ...a]), query),
  eq: (...a: unknown[]) => (calls.push(['eq', ...a]), query),
  order: (...a: unknown[]) => (calls.push(['order', ...a]), query),
  limit: async (...a: unknown[]) => (calls.push(['limit', ...a]), result),
};
vi.mock('./supabase', () => ({
  supabase: {
    from: () => query,
    rpc: async (...a: unknown[]) => (calls.push(['rpc', ...a]), { error: rpcError }),
  },
}));

const {
  canResend,
  channelLabel,
  fetchNotifications,
  notificationKindLabel,
  notificationStatusLabel,
  renderTemplate,
  resendNotification,
  SAMPLE_READY_VALUES,
  smsSegments,
  unknownPlaceholders,
} = await import('./notifications');

describe('renderTemplate (matches render_template)', () => {
  it('fills every placeholder and leaves unknown ones', () => {
    expect(renderTemplate('Hi {first_name}, {first_name}! {nope}', { first_name: 'Sam' })).toBe('Hi Sam, Sam! {nope}');
  });
  it('fills the sample values', () => {
    expect(renderTemplate('{racquet} at {shop_name} ({job_number})', SAMPLE_READY_VALUES)).toBe(
      'Wilson Blade 98 at Ace Racquets (J1042)',
    );
  });
});

describe('unknownPlaceholders', () => {
  it('names typos once', () => {
    expect(unknownPlaceholders('{firstname} {first_name} {firstname} {Shop}')).toEqual(['firstname', 'Shop']);
    expect(unknownPlaceholders('Hi {first_name}')).toEqual([]);
  });
});

describe('smsSegments', () => {
  it('counts 160 characters as one text, then 153 per part', () => {
    expect(smsSegments('x'.repeat(160))).toBe(1);
    expect(smsSegments('x'.repeat(161))).toBe(2);
    expect(smsSegments('x'.repeat(307))).toBe(3);
  });
});

describe('labels', () => {
  it('reads plainly', () => {
    expect(notificationKindLabel('job_ready')).toBe('Ready notice');
    expect(notificationKindLabel('receipt')).toBe('Receipt');
    expect(notificationStatusLabel('skipped')).toBe('Not sent');
    expect(channelLabel('sms')).toBe('Text');
    expect(channelLabel('email')).toBe('Email');
  });
  it('lets failed and not-sent messages go again', () => {
    const now = Date.parse('2026-11-24T18:30:00Z');
    expect(canResend({ status: 'failed', sending_at: null }, now)).toBe(true);
    expect(canResend({ status: 'skipped', sending_at: null }, now)).toBe(true);
    expect(canResend({ status: 'queued', sending_at: null }, now)).toBe(true);
    expect(canResend({ status: 'sent', sending_at: null }, now)).toBe(false);
    expect(canResend({ status: 'sending', sending_at: '2026-11-24T18:25:00Z' }, now)).toBe(false);
    expect(canResend({ status: 'sending', sending_at: '2026-11-24T18:20:00Z' }, now)).toBe(true);
    expect(canResend({ status: 'sending', sending_at: null }, now)).toBe(false);
  });
});

describe('fetchNotifications', () => {
  it('filters by what it was given, newest first', async () => {
    calls.length = 0;
    result = { data: [{ id: 'n1' }], error: null };
    expect(await fetchNotifications({ stringJobId: 'j1' })).toEqual([{ id: 'n1' }]);
    expect(calls).toContainEqual(['eq', 'string_job_id', 'j1']);
    expect(calls).toContainEqual(['order', 'created_at', { ascending: false }]);
    calls.length = 0;
    await fetchNotifications({ customerId: 'c1', saleId: 's1' });
    expect(calls).toContainEqual(['eq', 'customer_id', 'c1']);
    expect(calls).toContainEqual(['eq', 'sale_id', 's1']);
  });
  it('throws the database error', async () => {
    result = { data: null, error: new Error('nope') };
    await expect(fetchNotifications({})).rejects.toThrow('nope');
  });
  it('reads no rows as an empty list', async () => {
    result = { data: null, error: null };
    expect(await fetchNotifications({})).toEqual([]);
  });
});

describe('resendNotification', () => {
  it('calls the database and throws its reason', async () => {
    rpcError = null;
    await resendNotification('n1');
    expect(calls).toContainEqual(['rpc', 'resend_notification', { p_id: 'n1' }]);
    rpcError = new Error('Sam has opted out of texts');
    await expect(resendNotification('n1')).rejects.toThrow('Sam has opted out of texts');
  });
});
