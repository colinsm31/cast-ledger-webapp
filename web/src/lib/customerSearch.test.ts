// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const { CUSTOMER_SEARCH_LIMIT, searchCustomers, useCustomerMatches } = await import('./customerSearch');

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

describe('useCustomerMatches', () => {
  beforeEach(() => rpc.mockReset());

  it('looks customers up once typing stops, and matches nobody for an empty query', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'c1' }], error: null });
    const { result, rerender } = renderHook(({ query }) => useCustomerMatches(query), { initialProps: { query: 'pat' } });
    expect(result.current.searching).toBe(true); // still looking: not "no matches" yet
    await waitFor(() => expect(result.current).toEqual({ matches: [{ id: 'c1' }], searching: false }));
    expect(rpc).toHaveBeenCalledWith('search_customers', { p_term: 'pat', p_limit: CUSTOMER_SEARCH_LIMIT });
    rerender({ query: '  ' });
    expect(result.current).toEqual({ matches: [], searching: false });
  });

  it('shows no matches when the lookup fails', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    const { result } = renderHook(() => useCustomerMatches('pat'));
    await waitFor(() => expect(result.current.searching).toBe(false));
    expect(rpc).toHaveBeenCalled();
    expect(result.current.matches).toEqual([]);
  });
});
