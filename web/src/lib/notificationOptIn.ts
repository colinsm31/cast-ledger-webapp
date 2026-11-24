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

/** The opt-ins to save: a box left ticked after its contact was cleared is saved off, as the database does. */
export function optInsToSave(
  wanted: OptInState,
  contact: { email: string; phone: string },
): OptInState | { error: string } {
  const emailOn = wanted.email_opt_in && contact.email.trim() !== '';
  const smsOn = wanted.sms_opt_in && contact.phone.trim() !== '';
  if (emailOn) {
    const problem = optInProblem('email', contact.email);
    if (problem) return { error: problem };
  }
  if (smsOn) {
    const problem = optInProblem('sms', contact.phone);
    if (problem) return { error: problem };
  }
  return { email_opt_in: emailOn, sms_opt_in: smsOn };
}

/** e.g. "Ready messages: email and text", or null when they've opted in to none. */
export function optInLabel(customer: OptInState): string | null {
  const channels = [customer.email_opt_in && 'email', customer.sms_opt_in && 'text'].filter(Boolean);
  return channels.length ? `Ready messages: ${channels.join(' and ')}` : null;
}
