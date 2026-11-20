// What a string job's printed tag says (Phase 3A, 0066): its number and
// barcode, who and what it's for, the setup, when it's promised, and whether
// it's paid. The tag goes on the racquet, so it's short.
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { customerName, type StringJob } from '../../types/domain';
import { sideText } from './stringSummary';

export interface JobTag {
  /** "J1042": printed and encoded in the barcode. */
  code: string;
  customer: string;
  phone: string | null;
  racket: string;
  racketTag: string | null;
  /** "Mains  Babolat RPM Blast 16 @55", and crosses the same way (or "same"). */
  mains: string;
  crosses: string;
  promised: string | null;
  rush: boolean;
  paid: boolean;
  assignedTo: string | null;
  notes: string | null;
}

export type TagJob = Pick<
  StringJob,
  | 'job_number'
  | 'main_brand'
  | 'main_string'
  | 'main_specs'
  | 'main_tension'
  | 'main_customer_supplied'
  | 'cross_brand'
  | 'cross_string'
  | 'cross_specs'
  | 'cross_tension'
  | 'cross_customer_supplied'
  | 'promised_at'
  | 'is_rush'
  | 'paid_sale_id'
  | 'assigned_to'
  | 'notes'
> & {
  customer_rackets: {
    brand: string | null;
    model: string;
    barcode: string | null;
    customers: { first_name: string; last_name: string; phone_number: string | null } | null;
  } | null;
};

/** The barcode text for a job number. */
export function jobCode(jobNumber: number): string {
  return `J${jobNumber}`;
}

export function buildJobTag(job: TagJob): JobTag {
  const racket = job.customer_rackets;
  const owner = racket?.customers ?? null;
  const mains = sideText(job.main_brand, job.main_string, job.main_specs, job.main_tension, job.main_customer_supplied);
  const crosses = sideText(
    job.cross_brand,
    job.cross_string,
    job.cross_specs,
    job.cross_tension,
    job.cross_customer_supplied,
  );
  return {
    code: jobCode(job.job_number),
    customer: owner ? customerName(owner) : '—',
    phone: owner?.phone_number ?? null,
    racket: racket ? `${racket.brand ? `${racket.brand} ` : ''}${racket.model}` : '—',
    racketTag: racket?.barcode ?? null,
    mains: mains || '—',
    crosses: !crosses || crosses === mains ? 'Same as mains' : crosses,
    promised: job.promised_at
      ? new Date(job.promised_at).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null,
    rush: job.is_rush,
    paid: !!job.paid_sale_id,
    assignedTo: job.assigned_to,
    notes: job.notes?.trim() || null,
  };
}

const TAG_SELECT =
  'job_number, main_brand, main_string, main_specs, main_tension, main_customer_supplied, ' +
  'cross_brand, cross_string, cross_specs, cross_tension, cross_customer_supplied, ' +
  'promised_at, is_rush, paid_sale_id, assigned_to, notes, ' +
  'customer_rackets ( brand, model, barcode, customers ( first_name, last_name, phone_number ) )';

/** A job's tag. Throws when it can't be read. */
export async function fetchJobTag(jobId: string): Promise<JobTag> {
  const { data, error } = await supabase.from('string_jobs').select(TAG_SELECT).eq('id', jobId).single();
  if (error) throw new Error(`Couldn't load the job: ${errorMessage(error)}`);
  return buildJobTag(data as unknown as TagJob);
}
