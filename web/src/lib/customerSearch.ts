import { supabase } from './supabase';
import type { Customer } from '../types/domain';

export const CUSTOMER_SEARCH_LIMIT = 8;

/**
 * Customers matching a typed name, "first last", "last, first", email, or
 * phone digits, ordered by last name then first name. Matching happens in the
 * `search_customers` database function, so any characters are safe to pass.
 */
export async function searchCustomers(term: string, limit = CUSTOMER_SEARCH_LIMIT): Promise<Customer[]> {
  const { data, error } = await supabase.rpc('search_customers', { p_term: term, p_limit: limit });
  if (error) throw error;
  return (data ?? []) as Customer[];
}
