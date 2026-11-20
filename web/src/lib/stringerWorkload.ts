// Who string jobs are assigned to, and each stringer's load for a day
// (Phase 3A, 0064).

/** The queue filter value for jobs nobody is assigned to. */
export const UNASSIGNED = '__unassigned__';

export interface AssignedJob {
  assigned_to: string | null;
  promised_at: string | null;
}

export interface CompletedJob {
  strung_by: string | null;
  completed_at: string | null;
}

export interface StringerLoad {
  /** The stringer, or null for jobs nobody is assigned to. */
  stringer: string | null;
  /** Jobs waiting to be strung. */
  waiting: number;
  /** Waiting jobs promised on the day. */
  due: number;
  /** Waiting jobs whose promised time has passed. */
  overdue: number;
  /** Jobs this stringer finished on the day. */
  done: number;
}

/** The queue's jobs for one stringer ('' = everyone, UNASSIGNED = nobody). */
export function filterByStringer<T extends Pick<AssignedJob, 'assigned_to'>>(jobs: readonly T[], filter: string): T[] {
  if (!filter) return [...jobs];
  if (filter === UNASSIGNED) return jobs.filter((job) => !job.assigned_to);
  return jobs.filter((job) => job.assigned_to === filter);
}

/**
 * Each stringer's load on `day`: what's waiting for them (and of that, what's
 * due that day or already late) and what they finished that day. Stringers
 * are in name order with "unassigned" last; anyone with nothing is left out.
 */
export function stringerWorkload(
  waiting: readonly AssignedJob[],
  completed: readonly CompletedJob[],
  day: Date,
  now: Date,
): StringerLoad[] {
  const loads = new Map<string | null, StringerLoad>();
  const loadFor = (stringer: string | null) => {
    let load = loads.get(stringer);
    if (!load) {
      load = { stringer, waiting: 0, due: 0, overdue: 0, done: 0 };
      loads.set(stringer, load);
    }
    return load;
  };

  for (const job of waiting) {
    const load = loadFor(job.assigned_to || null);
    load.waiting += 1;
    if (job.promised_at) {
      const promised = new Date(job.promised_at);
      if (sameDay(promised, day)) load.due += 1;
      if (promised.getTime() < now.getTime()) load.overdue += 1;
    }
  }
  for (const job of completed) {
    if (!job.strung_by || !job.completed_at || !sameDay(new Date(job.completed_at), day)) continue;
    loadFor(job.strung_by).done += 1;
  }

  return [...loads.values()].sort((a, b) => {
    if (a.stringer === null) return 1;
    if (b.stringer === null) return -1;
    return a.stringer.localeCompare(b.stringer);
  });
}

/** The start of `day` and of the day after, for querying what was done that day. */
export function dayBounds(day: Date): { start: Date; end: Date } {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return { start, end: new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1) };
}

/** "Today", "Yesterday", "Tomorrow" or "Mon, Nov 17". */
export function dayLabel(day: Date, now: Date): string {
  const offset = Math.round((dayBounds(day).start.getTime() - dayBounds(now).start.getTime()) / 86_400_000);
  if (offset === 0) return 'Today';
  if (offset === -1) return 'Yesterday';
  if (offset === 1) return 'Tomorrow';
  return day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// MARK: - Private Helpers

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
