import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FunctionsHttpError } from '@supabase/supabase-js';

const invoke = vi.fn();
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));

const { invokeEdgeFunction } = await import('./edgeFunctions');

describe('invokeEdgeFunction', () => {
  beforeEach(() => invoke.mockReset());

  it("returns the function's response", async () => {
    invoke.mockResolvedValue({ data: { id: 'u1' }, error: null });
    await expect(invokeEdgeFunction('create-staff', { email: 'a@b.test' })).resolves.toEqual({ id: 'u1' });
    expect(invoke).toHaveBeenCalledWith('create-staff', { body: { email: 'a@b.test' } });
  });

  it("throws the function's own error message", async () => {
    const response = new Response(JSON.stringify({ error: 'Only an admin can add staff accounts' }), { status: 403 });
    invoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(response) });
    await expect(invokeEdgeFunction('create-staff', {})).rejects.toThrow('Only an admin can add staff accounts');
  });

  it("throws the client's error when the response has no message", async () => {
    const error = new FunctionsHttpError(new Response('not json', { status: 500 }));
    invoke.mockResolvedValue({ data: null, error });
    await expect(invokeEdgeFunction('create-staff', {})).rejects.toBe(error);
  });

  it('throws other errors as they are', async () => {
    const error = new Error('network down');
    invoke.mockResolvedValue({ data: null, error });
    await expect(invokeEdgeFunction('create-staff', {})).rejects.toBe(error);
  });
});
