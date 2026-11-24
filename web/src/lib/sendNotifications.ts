// Ask the send-notifications Edge Function to send one message, or a job's or
// a sale's queued messages (0086, 0088). Sending never blocks the work that queued them: a failure
// is reported, and the message stays in the log to send again.
import { invokeEdgeFunction } from './edgeFunctions';
import { errorMessage } from './errors';

export interface SendSummary {
  sent: number;
  failed: number;
  skipped: number;
  results: { id: string; status: 'sent' | 'failed' | 'skipped'; error?: string }[];
}

/** What to send; exactly one is given, so a request never sends the whole shop's queue. */
export type SendTarget = { notificationId: string } | { stringJobId: string } | { saleId: string };

export async function sendQueuedMessages(target: SendTarget): Promise<SendSummary> {
  return invokeEdgeFunction<SendSummary>('send-notifications', {
    ...('notificationId' in target ? { notification_id: target.notificationId } : {}),
    ...('stringJobId' in target ? { string_job_id: target.stringJobId } : {}),
    ...('saleId' in target ? { sale_id: target.saleId } : {}),
  });
}

/** A short line for staff, e.g. "Ready message sent." or null when nothing was queued. */
export function sendSummaryText(summary: SendSummary, noun = 'Ready message'): string | null {
  const total = summary.sent + summary.failed + summary.skipped;
  if (total === 0) return null;
  const parts: string[] = [];
  if (summary.sent) parts.push(`${summary.sent} sent`);
  if (summary.failed) parts.push(`${summary.failed} failed`);
  if (summary.skipped) parts.push(`${summary.skipped} not sent`);
  if (total === 1) {
    if (summary.sent) return `${noun} sent.`;
    const reason = summary.results[0]?.error;
    return `${noun} ${summary.failed ? 'failed' : 'not sent'}${reason ? `: ${reason}` : '.'}`;
  }
  return `${noun}s: ${parts.join(', ')}.`;
}

/** Send, turning any failure into a line for staff; never throws. */
export async function sendQueuedMessagesQuietly(
  target: SendTarget,
  noun?: string,
): Promise<string | null> {
  try {
    return sendSummaryText(await sendQueuedMessages(target), noun);
  } catch (err) {
    return `The message is queued but wasn't sent: ${errorMessage(err)}. Use Send again in the message log.`;
  }
}
