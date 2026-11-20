import { describe, expect, it } from 'vitest';
import { buildJobTag, jobCode, type TagJob } from './jobTag';

const job: TagJob = {
  job_number: 1042,
  main_brand: 'Babolat',
  main_string: 'RPM Blast',
  main_specs: { color: 'Black', gauge: '16' },
  main_tension: 55,
  main_customer_supplied: false,
  cross_brand: 'Babolat',
  cross_string: 'RPM Blast',
  cross_specs: { color: 'Black', gauge: '16' },
  cross_tension: 55,
  cross_customer_supplied: false,
  promised_at: new Date(2026, 10, 21, 17, 0).toISOString(),
  is_rush: true,
  paid_sale_id: 's1',
  assigned_to: 'Alex',
  notes: '  extra knot  ',
  customer_rackets: {
    brand: 'Head',
    model: 'Speed MP',
    barcode: 'TAG-7',
    customers: { first_name: 'Pat', last_name: 'Rally', phone_number: '(225) 555-0100' },
  },
};

describe('buildJobTag', () => {
  it('says what the job is, for whom, and when', () => {
    expect(buildJobTag(job)).toEqual({
      code: 'J1042',
      customer: 'Pat Rally',
      phone: '(225) 555-0100',
      racket: 'Head Speed MP',
      racketTag: 'TAG-7',
      mains: 'Babolat RPM Blast Black 16 @55',
      crosses: 'Same as mains',
      promised: 'Sat, Nov 21, 5:00 PM',
      rush: true,
      paid: true,
      assignedTo: 'Alex',
      notes: 'extra knot',
    });
  });

  it('shows a hybrid\'s crosses, the customer\'s own string, and what\'s missing', () => {
    const tag = buildJobTag({
      ...job,
      cross_brand: 'Luxilon',
      cross_string: 'ALU Power',
      cross_specs: {},
      cross_tension: 52,
      cross_customer_supplied: true,
      promised_at: null,
      is_rush: false,
      paid_sale_id: null,
      assigned_to: null,
      notes: '   ',
      customer_rackets: { brand: null, model: 'Old Frame', barcode: null, customers: null },
    });
    expect(tag.crosses).toBe('Luxilon ALU Power (customer’s) @52');
    expect(tag).toMatchObject({
      customer: '—',
      phone: null,
      racket: 'Old Frame',
      racketTag: null,
      promised: null,
      rush: false,
      paid: false,
      assignedTo: null,
      notes: null,
    });
  });

  it('writes the barcode text as J and the number', () => {
    expect(jobCode(7)).toBe('J7');
  });
});
