// Email a sale's receipt (0087): draw it from the saved sale, queue it, and
// hand it to the sender.
import { supabase } from './supabase';
import { fetchReceipt } from './receipt';
import { receiptEmailHtml, receiptEmailText } from './receiptEmail';
import { sendQueuedMessagesQuietly } from './sendNotifications';

/** Queue and send; resolves to a line for staff, throws if it couldn't be queued. */
export async function emailReceipt(saleId: string, to: string): Promise<string> {
  const receipt = await fetchReceipt(saleId);
  const { error } = await supabase.rpc('queue_receipt_email', {
    p_sale_id: saleId,
    p_to: to.trim(),
    p_html: receiptEmailHtml(receipt),
    p_text: receiptEmailText(receipt),
  });
  if (error) throw error;
  return (await sendQueuedMessagesQuietly({ saleId }, 'Receipt')) ?? 'Receipt queued.';
}

/** Keep the address on the customer's record, for next time. */
export async function saveCustomerEmail(customerId: string, email: string): Promise<void> {
  const { error } = await supabase.from('customers').update({ email: email.trim() }).eq('id', customerId);
  if (error) throw error;
}
