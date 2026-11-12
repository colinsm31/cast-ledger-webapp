// Creating a customer: from the Customers page, or inline at the register.
import { supabase } from './supabase';
import type { Customer } from '../types/domain';

export interface NewCustomerForm {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
}

/** Split a typed name into first and last: "Last, First", "First Last", or one word (the first name). */
export function splitName(raw: string): { first: string; last: string } {
  const text = raw.trim();
  if (!text) return { first: '', last: '' };
  if (text.includes(',')) {
    const [last, first] = text.split(',');
    return { first: (first ?? '').trim(), last: (last ?? '').trim() };
  }
  const parts = text.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/** An empty form, its name filled from what was typed in a search. */
export function newCustomerFormFrom(typedName: string): NewCustomerForm {
  const { first, last } = splitName(typedName);
  return { firstName: first, lastName: last, phone: '', email: '' };
}

/** The row to insert, or what's missing. */
export function newCustomerRow(
  form: NewCustomerForm,
): { first_name: string; last_name: string; phone_number: string | null; email: string | null } | { error: string } {
  if (!form.firstName.trim() || !form.lastName.trim()) return { error: 'First and last name are required' };
  return {
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    phone_number: form.phone.trim() || null,
    email: form.email.trim() || null,
  };
}

/** Insert the customer and return it; throws the database error. */
export async function createCustomer(row: Exclude<ReturnType<typeof newCustomerRow>, { error: string }>): Promise<Customer> {
  const { data, error } = await supabase.from('customers').insert(row).select('*').single();
  if (error) throw error;
  return data as Customer;
}
