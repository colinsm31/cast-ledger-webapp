import { beforeEach, describe, expect, it, vi } from 'vitest';

const select = vi.fn();
const rpc = vi.fn(() => ({ select }));
const query = {
  select: vi.fn(() => query),
  eq: vi.fn(() => query),
  order: vi.fn(() => query),
  limit: vi.fn(),
};
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...(args as [])), from: () => query } }));

const { fetchQuickPicks, priceLabel, searchProducts } = await import('./productSearch');
const product = { id: 'p1', brand: 'Wilson', name: 'Pro Overgrip', attributes: {}, sell_price: 3, is_serialized: false };

describe('searchProducts', () => {
  beforeEach(() => {
    rpc.mockClear();
    select.mockReset();
  });

  it('asks search_products for the register’s columns', async () => {
    select.mockResolvedValue({ data: [product], error: null });
    await expect(searchProducts('overgrip')).resolves.toEqual([product]);
    expect(rpc).toHaveBeenCalledWith('search_products', { p_term: 'overgrip', p_limit: 10 });
    expect(select).toHaveBeenCalledWith('id, brand, name, attributes, sell_price, is_serialized');
  });

  it('doesn’t search for blank text', async () => {
    await expect(searchProducts('   ')).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes a failure on', async () => {
    const failure = { message: 'permission denied' };
    select.mockResolvedValue({ data: null, error: failure });
    await expect(searchProducts('x')).rejects.toBe(failure);
  });
});

describe('fetchQuickPicks', () => {
  it('reads active quick picks by name, up to the limit', async () => {
    query.limit.mockResolvedValue({ data: [product], error: null });
    await expect(fetchQuickPicks()).resolves.toEqual([product]);
    expect(query.eq).toHaveBeenCalledWith('quick_pick', true);
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(query.order).toHaveBeenCalledWith('name');
    expect(query.limit).toHaveBeenCalledWith(12);
  });
});

describe('priceLabel', () => {
  it('shows the price, or that there is none', () => {
    expect(priceLabel({ sell_price: 3 })).toBe('$3.00');
    expect(priceLabel({ sell_price: null })).toBe('no price');
  });
});
