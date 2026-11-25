// A customer's say on being emailed or texted when their stringing is ready
// (0085). These mirror the database's phone_e164 / is_valid_email so the form
// can explain a problem before saving; the database has the final word.

export type NotificationChannel = 'email' | 'sms';

export interface OptInState {
  email_opt_in: boolean;
  sms_opt_in: boolean;
}

/** What staff read to the customer before ticking a box. */
export const OPT_IN_WORDING: Record<NotificationChannel, string> = {
  email: 'Email me when my stringing is ready',
  sms: 'Text me when my stringing is ready (message rates may apply; reply STOP to stop)',
};

/** A phone number a text can go to, as +1XXXXXXXXXX (or +digits), or null. */
export function phoneE164(phone: string | null | undefined): string | null {
  const text = (phone ?? '').trim();
  const digits = text.replace(/\D/g, '');
  if (text.startsWith('+') && !text.startsWith('+1')) {
    return /^\+[0-9 ().-]+$/.test(text) && digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (!/^\+?[0-9 ().-]+$/.test(text)) return null;
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return national.length === 10 && /^[2-9]/.test(national) ? `+1${national}` : null;
}

export function isValidEmail(email: string | null | undefined): boolean {
  const text = (email ?? '').trim();
  return text.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

/** Why a box can't be ticked with these contact details, or null. */
export function optInProblem(channel: NotificationChannel, contact: string): string | null {
  if (channel === 'email') return isValidEmail(contact) ? null : 'Add a valid email address to opt in to emails';
  return phoneE164(contact) ? null : 'Add a mobile number (10 digits) to opt in to texts';
}

/**
 * The opt-ins to save. A box whose email or number was cleared or isn't
 * usable is saved off, as the form shows it (the box can't be ticked then),
 * so the customer can still be saved.
 */
export function optInsToSave(wanted: OptInState, contact: { email: string; phone: string }): OptInState {
  return {
    email_opt_in: wanted.email_opt_in && optInProblem('email', contact.email) === null,
    sms_opt_in: wanted.sms_opt_in && optInProblem('sms', contact.phone) === null,
  };
}

/** An address or number as the database compares them: case, spaces and formatting don't count. */
function contactKey(channel: NotificationChannel, contact: string | null | undefined): string {
  const text = (contact ?? '').trim();
  return channel === 'email' ? text.toLowerCase() : (phoneE164(text) ?? text);
}

/** Whether an edit gives the channel a new address or number (or clears it). */
export function contactChanged(
  channel: NotificationChannel,
  saved: string | null | undefined,
  edited: string | null | undefined,
): boolean {
  return contactKey(channel, saved) !== contactKey(channel, edited);
}

export interface SavedContact extends OptInState {
  email: string | null;
  phone_number: string | null;
}

/**
 * Channels the customer just opted in to again for a new address. The
 * database turns an opt-in off when its address changes (0089), so these are
 * saved in a second step, after the new address: the history then shows the
 * old consent ending and the new one given.
 */
export function optInsGivenAgain(
  saved: SavedContact,
  edited: { email: string; phone: string },
  toSave: OptInState,
): Partial<OptInState> | null {
  const again: Partial<OptInState> = {};
  if (toSave.email_opt_in && saved.email_opt_in && contactChanged('email', saved.email, edited.email)) {
    again.email_opt_in = true;
  }
  if (toSave.sms_opt_in && saved.sms_opt_in && contactChanged('sms', saved.phone_number, edited.phone)) {
    again.sms_opt_in = true;
  }
  return Object.keys(again).length ? again : null;
}

/** e.g. "Ready messages: email and text", or null when they've opted in to none. */
export function optInLabel(customer: OptInState): string | null {
  const channels = [customer.email_opt_in && 'email', customer.sms_opt_in && 'text'].filter(Boolean);
  return channels.length ? `Ready messages: ${channels.join(' and ')}` : null;
}

/** e.g. "Opted in to texts" / "Opted out of emails", for the opt-in history. */
export function optInChangeLabel(change: { channel: NotificationChannel; opted_in: boolean }): string {
  const channel = change.channel === 'sms' ? 'texts' : 'emails';
  return change.opted_in ? `Opted in to ${channel}` : `Opted out of ${channel}`;
}
