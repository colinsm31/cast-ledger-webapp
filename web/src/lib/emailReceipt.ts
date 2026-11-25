// Email a sale's receipt. The database builds the email from the saved sale,
// in the printed letter receipt's layout (receipt_email_content, 0090); only
// the sale, the address and the time zone to write the time in go from here.
// Then the one queued email is handed to the sender.
import { supabase } from './supabase';
import { sendQueuedMessagesQuietly } from './sendNotifications';

/** This browser's time zone, e.g. "America/Chicago", or undefined if it can't tell. */
export function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** Queue and send; resolves to a line for staff, throws if it couldn't be queued. */
export async function emailReceipt(saleId: string, to: string): Promise<string> {
  const { data, error } = await supabase.rpc('queue_receipt_email', {
    p_sale_id: saleId,
    p_to: to.trim(),
    p_time_zone: browserTimeZone() ?? null,
  });
  if (error) throw error;
  return (await sendQueuedMessagesQuietly({ notificationId: data as string }, 'Receipt')) ?? 'Receipt queued.';
}

/** Keep the address on the customer's record, for next time. */
export async function saveCustomerEmail(customerId: string, email: string): Promise<void> {
  const { error } = await supabase.from('customers').update({ email: email.trim() }).eq('id', customerId);
  if (error) throw error;
}
