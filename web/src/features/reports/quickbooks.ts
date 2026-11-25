// The daily summary for QuickBooks (report_daily_summary, 0101) as a journal
// entry import file: one entry per day, numbered AS-YYYYMMDD, each line with
// its account, debit or credit, and a memo.

import { toCsv } from '../../lib/csv';

export interface JournalLine {
  day: string; // YYYY-MM-DD
  line_no: number;
  account: string;
  debit: number | null;
  credit: number | null;
  memo: string;
}

export const JOURNAL_HEADERS = ['Journal No', 'Journal Date', 'Account', 'Debits', 'Credits', 'Description'];

/** The journal entry number for a day, e.g. AS-20261125. */
export function journalNumber(day: string): string {
  return `AS-${day.replace(/-/g, '')}`;
}

const amount = (value: number | null) => (value === null ? null : Math.round(Number(value) * 100) / 100);

export function journalCsv(lines: JournalLine[]): string {
  return toCsv(
    JOURNAL_HEADERS,
    lines.map((line) => [journalNumber(line.day), line.day, line.account, amount(line.debit), amount(line.credit), line.memo]),
  );
}

/** Each day's debit and credit totals, which should match. */
export function dayTotals(lines: JournalLine[]): { day: string; debits: number; credits: number }[] {
  const days = new Map<string, { day: string; debits: number; credits: number }>();
  for (const line of lines) {
    const totals = days.get(line.day) ?? { day: line.day, debits: 0, credits: 0 };
    totals.debits = Math.round((totals.debits + Number(line.debit ?? 0)) * 100) / 100;
    totals.credits = Math.round((totals.credits + Number(line.credit ?? 0)) * 100) / 100;
    days.set(line.day, totals);
  }
  return [...days.values()];
}
