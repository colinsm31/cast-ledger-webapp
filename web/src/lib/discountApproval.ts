// An admin approves a discount over the staff limit at the staff member's
// register (approve_discount, 0056). The admin signs in on a second,
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

export interface ApprovalRequest {
  email: string;
  password: string;
  /** The percent off to approve: what the quote says the ticket needs. */
  maxPercent: number;
}

/** The approval's id, or throws an error worded for the cashier. */
export async function approveDiscountAsAdmin(
  request: ApprovalRequest,
  makeClient: () => SupabaseClient = createApprovalClient,
): Promise<string> {
  const email = request.email.trim();
  if (!email || !request.password) throw new Error('Enter the admin’s email and password.');
  const client = makeClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: request.password });
  if (signInError) throw new Error('That email and password didn’t work.');
  try {
    const { data, error } = await client.rpc('approve_discount', { p_max_percent: request.maxPercent });
    if (error) {
      if (error.code === '42501') throw new Error('That account isn’t an admin, so it can’t approve discounts.');
      throw new Error(`The approval wasn’t saved: ${errorMessage(error)}`);
    }
    return data as string;
  } finally {
    // This device only: the admin stays signed in wherever else they are.
    await client.auth.signOut({ scope: 'local' });
  }
}
