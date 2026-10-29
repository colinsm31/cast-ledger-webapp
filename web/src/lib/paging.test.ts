import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake `supabase.from(table).select().order().range()` that serves `rows`
// one page at a time and records each range asked for.
let rows: number[] = [];
let failure: unknown = null;
const ranges: [number, number][] = [];
const orders: string[] = [];
const query = {
  select: () => query,
  order: (column: string) => {
    orders.push(column);
    return query;
  },
  range: async (from: number, to: number) => {
    ranges.push([from, to]);
    return failure ? { data: null, error: failure } : { data: rows.slice(from, to + 1), error: null };
  },
};
const from = vi.fn((_table: string) => query);
vi.mock('./supabase', () => ({ supabase: { from: (table: string) => from(table) } }));

const { fetchAllRows, fetchAllRowsResult } = await import('./paging');

describe('fetchAllRows', () => {
  beforeEach(() => {
    rows = [];
    failure = null;
    ranges.length = 0;
    orders.length = 0;
    from.mockClear();
  });

  it('reads one page when there are fewer than 1000 rows', async () => {
    rows = [1, 2, 3];
    await expect(fetchAllRows('products', 'id', 'id')).resolves.toEqual([1, 2, 3]);
    expect(from).toHaveBeenCalledWith('products');
    expect(ranges).toEqual([[0, 999]]);
  });

  it('keeps reading pages until one comes back short', async () => {
    rows = Array.from({ length: 2500 }, (_, i) => i);
    const all = await fetchAllRows<number>('products', 'id', 'id');
    expect(all).toHaveLength(2500);
    expect(all[2499]).toBe(2499);
    expect(ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('reads one more (empty) page when the total is a multiple of 1000', async () => {
    rows = Array.from({ length: 1000 }, (_, i) => i);
    await expect(fetchAllRows('products', 'id', 'id')).resolves.toHaveLength(1000);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it('passes a failure on', async () => {
    failure = { message: 'timeout' };
    await expect(fetchAllRows('products', 'id', 'id')).rejects.toBe(failure);
  });

  it('sorts by every column given, in order, on each page', async () => {
    rows = Array.from({ length: 1500 }, (_, i) => i);
    await fetchAllRows('products', 'id, brand', ['brand', 'id']);
    expect(orders).toEqual(['brand', 'id', 'brand', 'id']);
  });
});

describe('fetchAllRowsResult', () => {
  beforeEach(() => {
    rows = [];
    failure = null;
  });

  it('returns the rows with no error', async () => {
    rows = [1, 2];
    await expect(fetchAllRowsResult('products', 'id', 'id')).resolves.toEqual({ data: [1, 2], error: null });
  });

  it('returns the failure instead of throwing', async () => {
    failure = { message: 'timeout' };
    await expect(fetchAllRowsResult('products', 'id', 'id')).resolves.toEqual({ data: null, error: failure });
  });
});
