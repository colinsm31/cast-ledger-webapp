import { useEffect, useState } from 'react';
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

/**
 * Customers matching what's typed, looked up 200 ms after typing stops. An
 * empty query matches nobody; a failed lookup shows no matches, so the user
 * can retype.
 */
export function useCustomerMatches(query: string): Customer[] {
  const [matches, setMatches] = useState<Customer[]>([]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setMatches([]);
      return;
    }
    let active = true;
    const handle = setTimeout(async () => {
      let found: Customer[] = [];
      try {
        found = await searchCustomers(term);
      } catch {
        // No matches; the user can retype.
      }
      if (active) setMatches(found);
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [query]);

  return matches;
}
