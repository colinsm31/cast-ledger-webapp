import { afterEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const { fetchDayReport, formatBusinessDay, shopToday, sideTotal } = await import('./dayReport');

afterEach(() => vi.clearAllMocks());

describe('dayReport', () => {
  it('loads a day\'s report and says when it can\'t', async () => {
    rpc.mockResolvedValueOnce({ data: { day: '2026-11-27' }, error: null });
    await expect(fetchDayReport('2026-11-27')).resolves.toEqual({ day: '2026-11-27' });
    expect(rpc).toHaveBeenCalledWith('report_day', { p_day: '2026-11-27' });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(fetchDayReport('2026-11-27')).rejects.toThrow("Couldn't load the daily report: offline");
  });

  it('adds up a side to the cent', () => {
    expect(sideTotal({ count: 2, items: 50.1, gift_cards: 25.2, tax: 4.13 })).toBe(79.43);
  });

  it('finds today in the shop\'s time zone, not the computer\'s', () => {
    const lateEvening = new Date('2026-11-28T03:00:00Z');
    expect(shopToday('America/Chicago', lateEvening)).toBe('2026-11-27');
    expect(shopToday('UTC', lateEvening)).toBe('2026-11-28');
  });

  it('writes a business day out in full', () => {
    expect(formatBusinessDay('2026-11-27')).toBe('Friday, November 27, 2026');
  });
});
