import { afterEach, describe, expect, it, vi } from 'vitest';

let result: { data: unknown; error: unknown } = { data: null, error: null };
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  is: vi.fn(() => query),
  order: vi.fn(() => query),
  limit: vi.fn(async () => result),
  maybeSingle: vi.fn(async () => result),
};
const rpc = vi.fn(async () => result);
vi.mock('./supabase', () => ({ supabase: { from: () => query, rpc: (...args: unknown[]) => rpc(...(args as [])) } }));
const fetchDayReport = vi.fn(async () => ({ day: '2026-11-27', live: true }));
vi.mock('./dayReport', () => ({ fetchDayReport: (...args: unknown[]) => fetchDayReport(...(args as [])) }));

const closes = await import('./dayCloses');

const row = {
  id: 'c1',
  business_day: '2026-11-27',
  closed_at: '2026-11-28T00:00:00Z',
  report: { day: '2026-11-27', saved: true },
  reopened_at: null,
  reopen_reason: null,
  closer: { email: 'pat@shop.test' },
  reopener: null,
};

afterEach(() => {
  vi.clearAllMocks();
  result = { data: null, error: null };
});

describe('day closes', () => {
  it('finds the close in force for a day, with the closer\'s name', async () => {
    result = { data: row, error: null };
    await expect(closes.fetchDayClose('2026-11-27')).resolves.toMatchObject({ closed_by: 'pat', reopened_by: null });
    expect(query.is).toHaveBeenCalledWith('reopened_at', null);
    result = { data: null, error: null };
    await expect(closes.fetchDayClose('2026-11-26')).resolves.toBeNull();
    result = { data: null, error: { message: 'offline' } };
    await expect(closes.fetchDayClose('2026-11-26')).rejects.toThrow("Couldn't check whether the day is closed: offline");
  });

  it('lists recent closes, newest first', async () => {
    result = { data: [row, { ...row, id: 'c0', reopened_at: '2026-11-28T01:00:00Z', reopener: { email: 'admin@shop.test' } }], error: null };
    const list = await closes.fetchRecentCloses();
    expect(list.map((close) => close.reopened_by)).toEqual([null, 'admin']);
    expect(query.order).toHaveBeenCalledWith('closed_at', { ascending: false });
    result = { data: null, error: { message: 'offline' } };
    await expect(closes.fetchRecentCloses()).rejects.toThrow("Couldn't load the past closes: offline");
  });

  it('prints the saved report for a closed day and the live one otherwise', async () => {
    result = { data: row, error: null };
    await expect(closes.fetchPrintableDayReport('2026-11-27')).resolves.toMatchObject({ report: { saved: true } });
    expect(fetchDayReport).not.toHaveBeenCalled();
    result = { data: null, error: null };
    await expect(closes.fetchPrintableDayReport('2026-11-27')).resolves.toEqual({
      report: { day: '2026-11-27', live: true },
      close: null,
    });
  });

  it('lists the days still open', async () => {
    result = { data: ['2026-11-26', '2026-11-27'], error: null };
    await expect(closes.fetchUnclosedDays()).resolves.toEqual(['2026-11-26', '2026-11-27']);
    expect(rpc).toHaveBeenCalledWith('unclosed_days');
    result = { data: null, error: { message: 'offline' } };
    await expect(closes.fetchUnclosedDays()).rejects.toThrow("Couldn't load the days still open: offline");
  });

  it('closes and reopens a day through the server functions', async () => {
    await closes.closeDay('2026-11-27');
    expect(rpc).toHaveBeenCalledWith('close_day', { p_day: '2026-11-27' });
    await closes.reopenDay('2026-11-27', '  ');
    expect(rpc).toHaveBeenCalledWith('reopen_day', { p_day: '2026-11-27', p_reason: null });
    result = { data: null, error: { message: 'Only an admin can reopen a closed day' } };
    await expect(closes.reopenDay('2026-11-27', 'Late sale')).rejects.toThrow('Only an admin can reopen a closed day');
    await expect(closes.closeDay('2026-11-27')).rejects.toThrow('Only an admin');
  });
});
