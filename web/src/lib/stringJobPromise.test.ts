import { describe, expect, it } from 'vitest';
import {
  defaultPromise,
  fromLocalInput,
  promiseLabel,
  promiseProblem,
  promiseState,
  sortOpenQueue,
  toLocalInput,
} from './stringJobPromise';

// Thursday, Nov 20 2026, 10:00 local time.
const now = new Date(2026, 10, 20, 10, 0);
const at = (day: number, hours: number, minutes = 0) => new Date(2026, 10, day, hours, minutes).toISOString();

describe('sortOpenQueue', () => {
  it('puts rush jobs first, then the soonest promise, then the earliest drop-off', () => {
    const jobs = [
      { id: 'late', is_rush: false, promised_at: at(22, 17), entered_at: at(18, 9) },
      { id: 'none', is_rush: false, promised_at: null, entered_at: at(10, 9) },
      { id: 'rush-later', is_rush: true, promised_at: at(21, 12), entered_at: at(20, 9) },
      { id: 'soon', is_rush: false, promised_at: at(20, 17), entered_at: at(19, 9) },
      { id: 'rush-soon', is_rush: true, promised_at: at(20, 12), entered_at: at(20, 9) },
      { id: 'soon-earlier', is_rush: false, promised_at: at(20, 17), entered_at: at(18, 9) },
    ];
    expect(sortOpenQueue(jobs).map((job) => job.id)).toEqual([
      'rush-soon',
      'rush-later',
      'soon-earlier',
      'soon',
      'late',
      'none',
    ]);
    expect(jobs[0].id).toBe('late'); // the input isn't reordered
  });
});

describe('promiseState and promiseLabel', () => {
  it('says when a job is overdue', () => {
    expect(promiseState(at(20, 9, 30), now)).toBe('overdue');
    expect(promiseLabel(at(20, 9, 30), now)).toBe('Overdue · was due today 9:30 AM');
    expect(promiseLabel(at(19, 17), now)).toBe('Overdue · was due yesterday 5:00 PM');
  });

  it('says when it is due today, tomorrow or later', () => {
    expect(promiseState(at(20, 17), now)).toBe('today');
    expect(promiseLabel(at(20, 17), now)).toBe('Due today 5:00 PM');
    expect(promiseState(at(21, 10), now)).toBe('later');
    expect(promiseLabel(at(21, 10), now)).toBe('Due tomorrow 10:00 AM');
    expect(promiseLabel(at(24, 17), now)).toBe('Due Tue, Nov 24, 5:00 PM');
  });

  it('says nothing for a job with no promise', () => {
    expect(promiseState(null, now)).toBeNull();
    expect(promiseLabel(null, now)).toBeNull();
  });
});

describe('the promised-time input', () => {
  it('defaults to the shop turnaround after now', () => {
    expect(defaultPromise(now, 24)).toEqual(new Date(2026, 10, 21, 10, 0));
  });

  it('round-trips a local date and time', () => {
    expect(toLocalInput(new Date(2026, 0, 5, 7, 3))).toBe('2026-01-05T07:03');
    expect(fromLocalInput('2026-01-05T07:03')).toEqual(new Date(2026, 0, 5, 7, 3));
  });

  it('refuses what isn\'t a date and time', () => {
    for (const text of ['', 'tomorrow', '2026-02-30T10:00', '2026-11-20']) {
      expect(fromLocalInput(text)).toBeNull();
      expect(promiseProblem(text, now)).toBe('Choose when the job will be ready.');
    }
  });

  it('refuses a past promise, allowing a few minutes', () => {
    expect(promiseProblem('2026-11-20T09:00', now)).toBe('The promised time has already passed.');
    expect(promiseProblem('2026-11-20T09:57', now)).toBeNull();
  });

  it('refuses a promise more than 90 days after drop-off', () => {
    expect(promiseProblem('2027-02-18T10:00', now)).toBeNull();
    expect(promiseProblem('2027-02-19T10:01', now)).toBe('Promise the job within 90 days of drop-off.');
    // Measured from when the job was taken in, not from today.
    expect(promiseProblem('2027-02-19T10:01', now, new Date(2026, 10, 25))).toBeNull();
  });
});
