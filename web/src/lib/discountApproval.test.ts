import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('./supabase', () => ({ supabaseUrl: 'http://localhost', supabaseAnonKey: 'anon' }));
const { approveDiscountAsAdmin, createApprovalClient } = await import('./discountApproval');

const signInWithPassword = vi.fn();
const signOut = vi.fn();
const rpc = vi.fn();
const fakeClient = () => ({ auth: { signInWithPassword, signOut }, rpc }) as unknown as SupabaseClient;
const request = { email: ' admin@shop.test ', password: 'pw', maxPercent: 50 };

describe('approveDiscountAsAdmin', () => {
  beforeEach(() => {
    signInWithPassword.mockReset().mockResolvedValue({ error: null });
    signOut.mockReset().mockResolvedValue({ error: null });
    rpc.mockReset().mockResolvedValue({ data: 'approval-1', error: null });
  });

  it('signs the admin in, approves the percent, and signs them out of this device only', async () => {
    await expect(approveDiscountAsAdmin(request, fakeClient)).resolves.toBe('approval-1');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'admin@shop.test', password: 'pw' });
    expect(rpc).toHaveBeenCalledWith('approve_discount', { p_max_percent: 50 });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('asks for both fields before trying', async () => {
    await expect(approveDiscountAsAdmin({ ...request, password: '' }, fakeClient)).rejects.toThrow(
      'Enter the admin’s email and password.',
    );
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('says when the sign-in fails, without approving', async () => {
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    await expect(approveDiscountAsAdmin(request, fakeClient)).rejects.toThrow('That email and password didn’t work.');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says when the account isn’t an admin, and still signs it out', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Only an admin can approve a discount' } });
    await expect(approveDiscountAsAdmin(request, fakeClient)).rejects.toThrow('That account isn’t an admin');
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('passes other failures on', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
    await expect(approveDiscountAsAdmin(request, fakeClient)).rejects.toThrow('The approval wasn’t saved: network down');
  });
});

describe('createApprovalClient', () => {
  it('makes a client that keeps nothing in storage', () => {
    const client = createApprovalClient();
    expect(client.auth).toBeDefined();
  });
});
