// The customer message log (0086): ready notices and emailed receipts, what
// each says and where it stands.
import { supabase } from './supabase';

export type NotificationKind = 'job_ready' | 'receipt';
export type NotificationStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  channel: 'email' | 'sms';
  customer_id: string | null;
  string_job_id: string | null;
  sale_id: string | null;
  to_address: string;
  subject: string | null;
  body: string;
  status: NotificationStatus;
  error: string | null;
  attempts: number;
  created_at: string;
  sending_at: string | null;
  finished_at: string | null;
}

/** The columns the screens read (not the receipt's HTML). */
export const NOTIFICATION_COLUMNS =
  'id, kind, channel, customer_id, string_job_id, sale_id, to_address, subject, body, status, error, attempts, created_at, sending_at, finished_at';

/** The placeholders a ready template can use, as the database fills them (job_ready_values). */
export const READY_PLACEHOLDERS = ['first_name', 'last_name', 'job_number', 'racquet', 'shop_name'] as const;

/** Example values for the Settings preview. */
export const SAMPLE_READY_VALUES: Record<(typeof READY_PLACEHOLDERS)[number], string> = {
  first_name: 'Sam',
  last_name: 'Player',
  job_number: 'J1042',
  racquet: 'Wilson Blade 98',
  shop_name: 'Ace Racquets',
};

/** Fill {name} placeholders, leaving unknown ones as typed (as render_template does). */
export function renderTemplate(template: string, values: Record<string, string>): string {
  let text = template;
  for (const [key, value] of Object.entries(values)) text = text.split(`{${key}}`).join(value);
  return text;
}

/** Placeholders in a template the database won't fill, e.g. a typo like {firstname}. */
export function unknownPlaceholders(template: string): string[] {
  const known = new Set<string>(READY_PLACEHOLDERS);
  const found = [...template.matchAll(/\{([a-z_]+)\}/gi)].map((m) => m[1]);
  return [...new Set(found.filter((name) => !known.has(name)))];
}

/** A text is one SMS segment up to 160 plain characters; longer ones cost more. */
export function smsSegments(text: string): number {
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
}

const KIND_LABELS: Record<NotificationKind, string> = { job_ready: 'Ready notice', receipt: 'Receipt' };
const STATUS_LABELS: Record<NotificationStatus, string> = {
  queued: 'Waiting to send',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  skipped: 'Not sent',
};

export function notificationKindLabel(kind: NotificationKind): string {
  return KIND_LABELS[kind];
}

export function notificationStatusLabel(status: NotificationStatus): string {
  return STATUS_LABELS[status];
}

export function channelLabel(channel: NotificationRow['channel']): string {
  return channel === 'sms' ? 'Text' : 'Email';
}

/** After this long "sending", the sender is taken to have stopped (claim_notifications, 0088). */
export const STUCK_SENDING_MINUTES = 10;

/**
 * Send again works on a message that failed, wasn't sent or is still waiting,
 * and on one stuck sending (resend_notification, 0088); not on a sent one.
 */
export function canResend(row: Pick<NotificationRow, 'status' | 'sending_at'>, now: number = Date.now()): boolean {
  if (row.status === 'failed' || row.status === 'skipped' || row.status === 'queued') return true;
  if (row.status !== 'sending' || !row.sending_at) return false;
  return now - new Date(row.sending_at).getTime() >= STUCK_SENDING_MINUTES * 60_000;
}

export async function fetchNotifications(filter: {
  customerId?: string;
  stringJobId?: string;
  saleId?: string;
}): Promise<NotificationRow[]> {
  let query = supabase.from('notifications').select(NOTIFICATION_COLUMNS);
  if (filter.customerId) query = query.eq('customer_id', filter.customerId);
  if (filter.stringJobId) query = query.eq('string_job_id', filter.stringJobId);
  if (filter.saleId) query = query.eq('sale_id', filter.saleId);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

/** Put a failed or not-sent message back in the queue; throws the database's reason. */
export async function resendNotification(id: string): Promise<void> {
  const { error } = await supabase.rpc('resend_notification', { p_id: id });
  if (error) throw error;
}
