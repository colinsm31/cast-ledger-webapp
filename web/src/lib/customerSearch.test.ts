import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const { CUSTOMER_SEARCH_LIMIT, searchCustomers } = await import('./customerSearch');

describe('searchCustomers', () => {
  beforeEach(() => rpc.mockReset());

  it('asks the search_customers function, with the default limit', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'c1' }], error: null });
    await expect(searchCustomers('pat')).resolves.toEqual([{ id: 'c1' }]);
    expect(rpc).toHaveBeenCalledWith('search_customers', { p_term: 'pat', p_limit: CUSTOMER_SEARCH_LIMIT });
  });

  it('returns no customers rather than null', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(searchCustomers('zzz', 3)).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledWith('search_customers', { p_term: 'zzz', p_limit: 3 });
  });

  it('passes a failure on', async () => {
    const failure = { message: 'permission denied' };
    rpc.mockResolvedValue({ data: null, error: failure });
    await expect(searchCustomers('pat')).rejects.toBe(failure);
  });
});
