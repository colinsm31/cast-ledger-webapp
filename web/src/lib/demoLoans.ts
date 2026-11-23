// Lending demo frames (Phase 3C, 0071). The database refuses anything else;
// these mirror its rules so the screens can say so first.
import type { DemoLoan } from '../types/domain';
import { fromLocalInput } from './stringJobPromise';

/** The database's limit on a deposit note, a loan note or a reason. */
export const DEMO_NOTE_MAX = 200;
/** The database's limit on how long a demo can be lent for. */
export const MAX_DEMO_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A loan's number as printed and spoken: "D1001". */
export function demoLoanLabel(loan: Pick<DemoLoan, 'loan_number'>): string {
  return `D${loan.loan_number}`;
}

/**
 * When a new loan is due back by default: the shop's loan days after now, at
 * the same time of day (so a clock change doesn't move it an hour).
 */
export function defaultDemoDue(now: Date, loanDays: number): Date {
  const due = new Date(now);
  due.setDate(due.getDate() + loanDays);
  return due;
}

/** What's wrong with a due time typed for a loan, or null. */
export function demoDueProblem(text: string, now: Date): string | null {
  const due = fromLocalInput(text);
  if (!due) return 'Choose when the demo is due back.';
  if (due.getTime() <= now.getTime()) return 'The due time has to be in the future.';
  if (due.getTime() > now.getTime() + MAX_DEMO_DAYS * DAY_MS) {
    return `A demo can be lent for at most ${MAX_DEMO_DAYS} days.`;
  }
  return null;
}

/** What's wrong with a note (deposit, loan note or reason), or null. */
export function demoNoteProblem(text: string): string | null {
  return text.trim().length > DEMO_NOTE_MAX ? `Keep each note to ${DEMO_NOTE_MAX} characters.` : null;
}

/** What's wrong with checking a demo in this way, or null. */
export function checkInProblem(to: 'demo' | 'retired', reason: string): string | null {
  if (to === 'retired' && !reason.trim()) return 'Say why the frame is retired.';
  return demoNoteProblem(reason);
}

/** Loans still out, the one due back soonest first. */
export function sortOpenLoans<T extends Pick<DemoLoan, 'due_back_at' | 'loan_number'>>(loans: readonly T[]): T[] {
  return [...loans].sort(
    (a, b) => new Date(a.due_back_at).getTime() - new Date(b.due_back_at).getTime() || a.loan_number - b.loan_number,
  );
}

/** How many loans are past their due time. */
export function overdueCount(loans: readonly Pick<DemoLoan, 'due_back_at'>[], now: Date): number {
  return loans.filter((loan) => new Date(loan.due_back_at).getTime() < now.getTime()).length;
}

/** Where a loan stands: "Out", "Back", or "Back, retired". */
export function demoOutcome(loan: Pick<DemoLoan, 'back_at' | 'back_status'>): string {
  if (!loan.back_at) return 'Out';
  return loan.back_status === 'retired' ? 'Back, retired' : 'Back';
}

/** "2 of 5 led to a sale", or null for no loans. */
export function conversionSummary(loans: readonly Pick<DemoLoan, 'sale_id'>[]): string | null {
  if (loans.length === 0) return null;
  const sold = loans.filter((loan) => loan.sale_id).length;
  return `${sold} of ${loans.length} led to a sale`;
}
