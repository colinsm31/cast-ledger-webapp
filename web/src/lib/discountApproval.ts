// An admin approves a discount over the staff limit (approve_discount, 0056)
// or a gift card load refund (approve_refund, 0075/0078) at the staff member's
// register. The admin signs in on a second,
// short-lived client that's never saved, so the register stays signed in as
// the staff member; the admin is signed out of this device straight after.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from './supabase';
import { errorMessage } from './errors';

export const APPROVAL_STORAGE_KEY = 'acestock.discountApproval';

export function createApprovalClient(): SupabaseClient {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: APPROVAL_STORAGE_KEY,
    },
  });
}

export interface AdminCredentials {
  email: string;
  password: string;
}

export interface ApprovalRequest extends AdminCredentials {
  /** The percent off to approve: what the quote says the ticket needs. */
  maxPercent: number;
}

/**
 * Signs the admin in on a short-lived client, calls the approval function and
 * signs them out of this device. The approval's id, or throws an error worded
 * for the cashier. `what` names what's approved ("discounts", "refunds").
 */
export async function approveAsAdmin(
  credentials: AdminCredentials,
  approval: { rpc: string; args?: Record<string, unknown>; what: string },
  makeClient: () => SupabaseClient = createApprovalClient,
): Promise<string> {
  const email = credentials.email.trim();
  if (!email || !credentials.password) throw new Error('Enter the admin’s email and password.');
  const client = makeClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: credentials.password });
  if (signInError) throw new Error('That email and password didn’t work.');
  try {
    const { data, error } = await client.rpc(approval.rpc, approval.args ?? {});
    if (error) {
      if (error.code === '42501') throw new Error(`That account isn’t an admin, so it can’t approve ${approval.what}.`);
      throw new Error(`The approval wasn’t saved: ${errorMessage(error)}`);
    }
    return data as string;
  } finally {
    // This device only: the admin stays signed in wherever else they are.
    await client.auth.signOut({ scope: 'local' });
  }
}

/** An admin's approval for a discount over the staff limit (approve_discount, 0056). */
export function approveDiscountAsAdmin(
  request: ApprovalRequest,
  makeClient: () => SupabaseClient = createApprovalClient,
): Promise<string> {
  return approveAsAdmin(
    request,
    { rpc: 'approve_discount', args: { p_max_percent: request.maxPercent }, what: 'discounts' },
    makeClient,
  );
}

/** What a load-refund approval covers (0078): one sale's loads, for this total. */
export interface RefundApprovalScope {
  saleId: string;
  amount: number;
}

/** How long a load-refund approval lasts on the server (refund_approvals.expires_at, 0075). */
export const REFUND_APPROVAL_MINUTES = 15;

/** An admin's approval for refunding one sale's gift card loads (approve_refund, 0078). */
export function approveRefundAsAdmin(
  credentials: AdminCredentials,
  scope: RefundApprovalScope,
  makeClient: () => SupabaseClient = createApprovalClient,
): Promise<string> {
  return approveAsAdmin(
    credentials,
    { rpc: 'approve_refund', args: { p_sale_id: scope.saleId, p_amount: scope.amount }, what: 'refunds' },
    makeClient,
  );
}
