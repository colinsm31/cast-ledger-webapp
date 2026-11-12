// Held tickets in the database (0061): named, visible from any register,
// expiring after the shop's set time. Recalling one takes it off hold, and
// its prices are refreshed so it never rings at an old price.
import { supabase } from './supabase';
import type { HeldSale } from './heldSale';
import type { Customer } from '../types/domain';
import { customerName } from '../types/domain';
import type { StaffRef } from './staff';

/** What's kept of a ticket on hold: the register's ticket, without its owner or customer snapshot. */
export type HeldTicketContent = Omit<HeldSale, 'userId' | 'customer'>;

export interface HeldTicketRow {
  id: string;
  name: string;
  customer_id: string | null;
  ticket: HeldTicketContent;
  held_at: string;
  expires_at: string;
  held_by_staff: StaffRef | null;
  customers: { first_name: string; last_name: string } | null;
}

export interface RecalledTicket {
  name: string;
  customer: Customer | null;
  content: HeldTicketContent;
}

/** "Pat Rally" for a ticket with a customer, else "Ticket 3:41 PM". */
export function defaultHoldName(customer: Pick<Customer, 'first_name' | 'last_name'> | null, now = new Date()): string {
  if (customer) return customerName(customer);
  return `Ticket ${now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

/** "3 items" on a held ticket. */
export function heldItemsLabel(content: Pick<HeldTicketContent, 'lines'>): string {
  const items = content.lines.reduce((sum, line) => sum + line.qty, 0);
  return `${items} item${items === 1 ? '' : 's'}`;
}

/** Put the ticket on hold; returns its id. Throws the database error. */
export async function holdTicket(name: string, customerId: string | null, content: HeldTicketContent): Promise<string> {
  const { data, error } = await supabase.rpc('hold_ticket', {
    p_name: name,
    p_customer_id: customerId,
    p_ticket: content,
  });
  if (error) throw error;
  return data as string;
}

/** Every ticket on hold that hasn't expired, newest first. */
export async function listHeldTickets(now = new Date()): Promise<HeldTicketRow[]> {
  const { data, error } = await supabase
    .from('held_tickets')
    .select(
      'id, name, customer_id, ticket, held_at, expires_at, held_by_staff:profiles!held_tickets_held_by_fkey ( email ), customers ( first_name, last_name )',
    )
    .gt('expires_at', now.toISOString())
    .order('held_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as HeldTicketRow[];
}

/** Take a ticket off hold, with its customer as they are now. Throws when another register got it first. */
export async function recallHeldTicket(id: string): Promise<RecalledTicket> {
  const { data, error } = await supabase.rpc('recall_held_ticket', { p_id: id });
  if (error) throw error;
  const recalled = data as { name: string; customer_id: string | null; ticket: HeldTicketContent };
  let customer: Customer | null = null;
  if (recalled.customer_id) {
    const { data: row } = await supabase.from('customers').select('*').eq('id', recalled.customer_id).maybeSingle();
    customer = (row as Customer | null) ?? null;
  }
  return { name: recalled.name, customer, content: recalled.ticket };
}

/**
 * Each line's list price now, in ticket order: the product's catalog price or
 * the string job's price; null for a gift card load or a line no longer found.
 */
export async function currentListPrices(
  lines: { productId?: string; stringJobId?: string; giftCardId?: string }[],
): Promise<(number | null)[]> {
  const productIds = [...new Set(lines.map((line) => line.productId).filter((id): id is string => !!id))];
  const jobIds = [...new Set(lines.map((line) => line.stringJobId).filter((id): id is string => !!id))];
  const [products, jobs] = await Promise.all([
    productIds.length
      ? supabase.from('products').select('id, sell_price').in('id', productIds)
      : Promise.resolve({ data: [], error: null }),
    jobIds.length
      ? supabase.from('string_jobs').select('id, price').in('id', jobIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (products.error) throw products.error;
  if (jobs.error) throw jobs.error;
  const productPrice = new Map(
    ((products.data ?? []) as { id: string; sell_price: number | null }[]).map((row) => [row.id, row.sell_price]),
  );
  const jobPrice = new Map(((jobs.data ?? []) as { id: string; price: number | null }[]).map((row) => [row.id, row.price]));
  return lines.map((line) => {
    const price = line.stringJobId
      ? jobPrice.get(line.stringJobId)
      : line.productId && !line.giftCardId
        ? productPrice.get(line.productId)
        : null;
    return price == null ? null : Number(price);
  });
}

/** Throw a held ticket away. Throws the database error. */
export async function discardHeldTicket(id: string): Promise<void> {
  const { error } = await supabase.from('held_tickets').delete().eq('id', id);
  if (error) throw error;
}
