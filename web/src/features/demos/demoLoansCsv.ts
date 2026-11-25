// A demo loan list as CSV (Demos out / Demos returned).

import { csvFileName, localDateTimeString, toCsv } from '../../lib/csv';
import { demoLoanLabel } from '../../lib/demoLoans';
import { customerNameLastFirst } from '../../types/domain';
import { frameRacquetName, type LoanWithFrame } from './demoLoanQueries';

export function demoLoansCsv(loans: LoanWithFrame[]): string {
  return toCsv(
    ['Loan', 'Racquet', 'Frame barcode', 'Customer', 'Out', 'Due back', 'Back', 'Back to', 'Reason', 'Deposit', 'Note', 'Led to a sale'],
    loans.map((loan) => [
      demoLoanLabel(loan),
      frameRacquetName(loan),
      loan.product_units?.barcode ?? '',
      loan.customers ? customerNameLastFirst(loan.customers) : '',
      localDateTimeString(loan.out_at),
      localDateTimeString(loan.due_back_at),
      localDateTimeString(loan.back_at),
      loan.back_status === 'retired' ? 'Retired' : loan.back_status === 'demo' ? 'Demo fleet' : '',
      loan.back_reason,
      loan.deposit_note,
      loan.note,
      loan.sale_id !== null,
    ]),
  );
}

/** e.g. "demos-out_2026-11-25.csv", named for the day it was saved. */
export function demoLoansFileName(which: 'out' | 'returned'): string {
  const today = new Date();
  return csvFileName(`demos ${which}`, { from: today, to: today });
}
