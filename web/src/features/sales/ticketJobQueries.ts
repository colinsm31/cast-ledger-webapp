import { supabase } from '../../lib/supabase';
import type { Customer, StringJobStatus } from '../../types/domain';
import type { TicketJob } from './ticketJobs';

interface TicketJobRow {
  id: string;
  price: number | null;
  status: StringJobStatus;
  paid_sale_id: string | null;
  customer_rackets: { brand: string | null; model: string; customers: Customer | null } | null;
}

const TICKET_JOB_SELECT = 'id, price, status, paid_sale_id, customer_rackets!inner ( brand, model, customer_id, customers ( * ) )';

function toTicketJob(row: TicketJobRow): TicketJob {
  const racket = row.customer_rackets;
  return {
    id: row.id,
    price: row.price,
    status: row.status,
    paidSaleId: row.paid_sale_id,
    racketLabel: racket ? `${racket.brand ? `${racket.brand} ` : ''}${racket.model}` : 'racquet',
    owner: racket?.customers ?? null,
  };
}

/** One string job, for adding to a ticket. Throws on a database error. */
export async function fetchTicketJob(jobId: string): Promise<TicketJob> {
  const { data, error } = await supabase.from('string_jobs').select(TICKET_JOB_SELECT).eq('id', jobId).single();
  if (error) throw error;
  return toTicketJob(data as unknown as TicketJobRow);
}

/** A customer's open (entered or complete) string jobs that haven't been paid. */
export async function fetchUnpaidOpenJobs(customerId: string): Promise<TicketJob[]> {
  const { data, error } = await supabase
    .from('string_jobs')
    .select(TICKET_JOB_SELECT)
    .eq('customer_rackets.customer_id', customerId)
    .in('status', ['entered', 'complete'])
    .is('paid_sale_id', null)
    .order('entered_at');
  if (error) throw error;
  return ((data ?? []) as unknown as TicketJobRow[]).map(toTicketJob);
}
