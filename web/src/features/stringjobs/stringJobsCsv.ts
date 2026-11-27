// A re-string list as CSV (Open / Completed Re-Strings).

import { localDateTimeString, csvMoney, toCsv } from '../../lib/csv';
import type { StringJob } from '../../types/domain';
import { customerNameLastFirst } from '../../types/domain';
import { jobCode } from './jobTag';
import { stringSummary } from './stringSummary';

export interface StringJobCsvRow extends StringJob {
  customer_rackets: {
    brand: string | null;
    model: string;
    customers: { first_name: string; last_name: string } | null;
  } | null;
}

export function stringJobsCsv(jobs: StringJobCsvRow[]): string {
  return toCsv(
    ['Job', 'Customer', 'Racquet', 'Strings', 'Rush', 'Promised', 'Entered', 'Completed', 'Assigned to', 'Strung by', 'Price', 'Paid'],
    jobs.map((job) => [
      jobCode(job.job_number),
      job.customer_rackets?.customers ? customerNameLastFirst(job.customer_rackets.customers) : '',
      [job.customer_rackets?.brand, job.customer_rackets?.model].filter(Boolean).join(' '),
      stringSummary(job),
      job.is_rush,
      localDateTimeString(job.promised_at),
      localDateTimeString(job.entered_at),
      localDateTimeString(job.completed_at),
      job.assigned_to,
      job.strung_by,
      csvMoney(job.price),
      job.paid_sale_id !== null,
    ]),
  );
}
