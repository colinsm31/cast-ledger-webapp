import { describe, expect, it } from 'vitest';
import {
  conversionSummary,
  defaultDemoDue,
  demoDueProblem,
  demoLoanLabel,
  demoNoteProblem,
  demoOutcome,
  overdueCount,
  sortOpenLoans,
} from './demoLoans';
import { toLocalInput } from './stringJobPromise';

const now = new Date(2026, 10, 22, 10, 0);
const hours = (n: number) => new Date(now.getTime() + n * 60 * 60 * 1000);

describe('demoLoans', () => {
  it('numbers a loan D and its number', () => {
    expect(demoLoanLabel({ loan_number: 1001 })).toBe('D1001');
  });

  it('is due back the shop\'s loan days from now by default', () => {
    expect(defaultDemoDue(now, 3)).toEqual(new Date(2026, 10, 25, 10, 0));
    // Across the clock change (Nov 1, 2026 in the US) it keeps the time of day.
    const beforeChange = new Date(2026, 9, 31, 10, 0);
    expect(defaultDemoDue(beforeChange, 3)).toEqual(new Date(2026, 10, 3, 10, 0));
  });

  it('needs a due time in the future, at most 90 days away', () => {
    expect(demoDueProblem('', now)).toBe('Choose when the demo is due back.');
    expect(demoDueProblem(toLocalInput(hours(-1)), now)).toBe('The due time has to be in the future.');
    expect(demoDueProblem(toLocalInput(hours(91 * 24)), now)).toBe('A demo can be lent for at most 90 days.');
    expect(demoDueProblem(toLocalInput(hours(48)), now)).toBeNull();
  });

  it('keeps notes to 200 characters', () => {
    expect(demoNoteProblem(' card on file ')).toBeNull();
    expect(demoNoteProblem('x'.repeat(201))).toBe('Keep each note to 200 characters.');
  });

  it('lists the loan due soonest first and counts the overdue ones', () => {
    const loans = [
      { loan_number: 1003, due_back_at: hours(5).toISOString() },
      { loan_number: 1002, due_back_at: hours(-2).toISOString() },
      { loan_number: 1001, due_back_at: hours(5).toISOString() },
    ];
    expect(sortOpenLoans(loans).map((loan) => loan.loan_number)).toEqual([1002, 1001, 1003]);
    expect(overdueCount(loans, now)).toBe(1);
  });

  it('says where a loan stands', () => {
    expect(demoOutcome({ back_at: null, back_status: null })).toBe('Out');
    expect(demoOutcome({ back_at: 'x', back_status: 'demo' })).toBe('Back');
    expect(demoOutcome({ back_at: 'x', back_status: 'retired' })).toBe('Back, retired');
  });

  it('sums up how many demos led to a sale', () => {
    expect(conversionSummary([])).toBeNull();
    expect(conversionSummary([{ sale_id: 's1' }, { sale_id: null }, { sale_id: null }])).toBe('1 of 3 led to a sale');
  });
});
