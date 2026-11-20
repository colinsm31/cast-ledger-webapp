import { describe, expect, it } from 'vitest';
import { UNASSIGNED, dayBounds, dayLabel, filterByStringer, stringerWorkload } from './stringerWorkload';

// Thursday, Nov 20 2026, 10:00 local time.
const now = new Date(2026, 10, 20, 10, 0);
const at = (day: number, hours: number) => new Date(2026, 10, day, hours).toISOString();

describe('filterByStringer', () => {
  const jobs = [
    { id: 1, assigned_to: 'Alex' },
    { id: 2, assigned_to: null },
    { id: 3, assigned_to: 'Jo' },
    { id: 4, assigned_to: 'Alex' },
  ];

  it('keeps every job with no filter', () => {
    expect(filterByStringer(jobs, '').map((job) => job.id)).toEqual([1, 2, 3, 4]);
  });

  it('keeps one stringer\'s jobs, or the unassigned ones', () => {
    expect(filterByStringer(jobs, 'Alex').map((job) => job.id)).toEqual([1, 4]);
    expect(filterByStringer(jobs, UNASSIGNED).map((job) => job.id)).toEqual([2]);
    expect(filterByStringer(jobs, 'Sam')).toEqual([]);
  });
});

describe('stringerWorkload', () => {
  const waiting = [
    { assigned_to: 'Jo', promised_at: at(20, 17) }, // due today
    { assigned_to: 'Alex', promised_at: at(20, 9) }, // due today, already late
    { assigned_to: 'Alex', promised_at: at(19, 17) }, // late from yesterday
    { assigned_to: 'Alex', promised_at: at(22, 12) }, // later
    { assigned_to: null, promised_at: at(20, 15) }, // unassigned, due today
    { assigned_to: 'Jo', promised_at: null }, // before promises existed
  ];
  const completed = [
    { strung_by: 'Alex', completed_at: at(20, 8) },
    { strung_by: 'Sam', completed_at: at(20, 9) },
    { strung_by: 'Sam', completed_at: at(19, 16) }, // another day
    { strung_by: null, completed_at: at(20, 9) },
  ];

  it('counts each stringer\'s waiting, due, late and finished jobs for the day', () => {
    expect(stringerWorkload(waiting, completed, now, now)).toEqual([
      { stringer: 'Alex', waiting: 3, due: 1, overdue: 2, done: 1 },
      { stringer: 'Jo', waiting: 2, due: 1, overdue: 0, done: 0 },
      { stringer: 'Sam', waiting: 0, due: 0, overdue: 0, done: 1 },
      { stringer: null, waiting: 1, due: 1, overdue: 0, done: 0 },
    ]);
  });

  it('counts what is due and done on another day', () => {
    const yesterday = new Date(2026, 10, 19);
    expect(stringerWorkload(waiting, completed, yesterday, now)).toEqual([
      { stringer: 'Alex', waiting: 3, due: 1, overdue: 2, done: 0 },
      { stringer: 'Jo', waiting: 2, due: 0, overdue: 0, done: 0 },
      { stringer: 'Sam', waiting: 0, due: 0, overdue: 0, done: 1 },
      { stringer: null, waiting: 1, due: 0, overdue: 0, done: 0 },
    ]);
  });

  it('is empty with nothing waiting or done', () => {
    expect(stringerWorkload([], [], now, now)).toEqual([]);
  });
});

describe('days', () => {
  it('spans midnight to midnight', () => {
    expect(dayBounds(now)).toEqual({ start: new Date(2026, 10, 20), end: new Date(2026, 10, 21) });
  });

  it('names nearby days', () => {
    expect(dayLabel(new Date(2026, 10, 20, 23), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 10, 19), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 10, 21), now)).toBe('Tomorrow');
    expect(dayLabel(new Date(2026, 10, 17), now)).toBe('Tue, Nov 17');
  });
});
