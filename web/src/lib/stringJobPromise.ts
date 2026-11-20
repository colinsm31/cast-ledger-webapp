// When a string job was promised, and how the open queue orders jobs by it
// (Phase 3A, 0063). The database sets the default promise and refuses a past
// one; these mirror its rules so the screens can say so first.

/** The database's limit on how far ahead a job can be promised. */
export const MAX_PROMISE_DAYS = 90;
/** The database's grace for a promise that has just slipped into the past. */
const PAST_GRACE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface QueueOrderFields {
  is_rush: boolean;
  promised_at: string | null;
  entered_at: string;
}

/**
 * The open queue's order: rush jobs first, then by promised time (soonest
 * first, jobs with no promise last), then by drop-off.
 */
export function sortOpenQueue<T extends QueueOrderFields>(jobs: readonly T[]): T[] {
  const time = (iso: string | null) => (iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY);
  return [...jobs].sort(
    (a, b) =>
      Number(b.is_rush) - Number(a.is_rush) ||
      time(a.promised_at) - time(b.promised_at) ||
      time(a.entered_at) - time(b.entered_at),
  );
}

export type PromiseState = 'overdue' | 'today' | 'later';

/** Text colors for each promise state. */
export const PROMISE_STATE_CLASSES: Record<PromiseState, string> = {
  overdue: 'font-semibold text-red-700',
  today: 'font-medium text-amber-700',
  later: 'text-slate-500',
};

/** Whether a promise has passed, falls later today, or is further off. */
export function promiseState(promisedAt: string | null, now: Date): PromiseState | null {
  if (!promisedAt) return null;
  const promised = new Date(promisedAt);
  if (promised.getTime() < now.getTime()) return 'overdue';
  return sameDay(promised, now) ? 'today' : 'later';
}

/** "Overdue · was due today 3:00 PM", "Due today 5:00 PM", "Due tomorrow 10:00 AM", "Due Fri, Nov 21, 5:00 PM". */
export function promiseLabel(promisedAt: string | null, now: Date): string | null {
  const state = promiseState(promisedAt, now);
  if (!state || !promisedAt) return null;
  const when = whenLabel(new Date(promisedAt), now);
  return state === 'overdue' ? `Overdue · was due ${when}` : `Due ${when}`;
}

/** The default promise: the shop's turnaround after now. */
export function defaultPromise(now: Date, turnaroundHours: number): Date {
  return new Date(now.getTime() + turnaroundHours * 60 * 60 * 1000);
}

/** A date as a datetime-local input's value, in local time, to the minute. */
export function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A datetime-local input's value as a date, or null when it isn't one. */
export function fromLocalInput(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [year, month, day, hours, minutes] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hours, minutes);
  // Refuse dates the calendar rolled over, like Feb 30.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** What's wrong with a promised time typed at drop-off or later, or null. */
export function promiseProblem(text: string, now: Date, enteredAt: Date = now): string | null {
  const promised = fromLocalInput(text);
  if (!promised) return 'Choose when the job will be ready.';
  if (promised.getTime() < now.getTime() - PAST_GRACE_MS) return 'The promised time has already passed.';
  if (promised.getTime() > enteredAt.getTime() + MAX_PROMISE_DAYS * DAY_MS) {
    return `Promise the job within ${MAX_PROMISE_DAYS} days of drop-off.`;
  }
  return null;
}

// MARK: - Private Helpers

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function whenLabel(date: Date, now: Date): string {
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (sameDay(date, now)) return `today ${time}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (sameDay(date, tomorrow)) return `tomorrow ${time}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (sameDay(date, yesterday)) return `yesterday ${time}`;
  const day = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day}, ${time}`;
}
