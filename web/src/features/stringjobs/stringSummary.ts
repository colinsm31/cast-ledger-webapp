import type { JsonValue, StringJob } from '../../types/domain';

// A one-line description of a job's string setup.
// "Head Lynx 16 Black @55 / Wilson NXT 16 @50" for a hybrid, or a single line
// when mains and crosses are the same string.
export function stringSummary(job: StringJob): string {
  const mains = sideText(job.main_brand, job.main_string, job.main_specs, job.main_tension, job.main_customer_supplied);
  const crosses = sideText(
    job.cross_brand,
    job.cross_string,
    job.cross_specs,
    job.cross_tension,
    job.cross_customer_supplied,
  );

  if (!crosses || crosses === mains) return mains || '—';
  if (!mains) return crosses;
  return `${mains} / ${crosses}`;
}

function sideText(
  brand: string | null,
  name: string | null,
  specs: Record<string, JsonValue> | null,
  tension: number | null,
  customerSupplied = false,
): string {
  const specValues = Object.values(specs ?? {})
    .filter((v) => v != null && v !== '')
    .map(String);
  const parts = [brand, name, ...specValues, customerSupplied ? '(customer’s)' : ''].filter(Boolean).join(' ');
  const t = tension != null ? ` @${tension}` : '';
  return `${parts}${t}`.trim();
}
