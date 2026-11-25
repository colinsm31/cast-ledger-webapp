import { describe, expect, it } from 'vitest';
import { stringJobsCsv, type StringJobCsvRow } from './stringJobsCsv';

const job = {
  id: 'j1', job_number: 1042, status: 'entered', is_rush: true, promised_at: '2026-11-25T15:00:00Z',
  entered_at: '2026-11-24T15:00:00Z', completed_at: null, assigned_to: 'Sam', strung_by: null, price: 30, paid_sale_id: null,
  main_brand: 'Luxilon', main_string: 'ALU Power', main_specs: '16L', main_tension: 52, main_customer_supplied: false,
  cross_brand: 'Luxilon', cross_string: 'ALU Power', cross_specs: '16L', cross_tension: 52, cross_customer_supplied: false,
  customer_rackets: { brand: 'Head', model: 'Speed MP', customers: { first_name: 'Pat', last_name: 'Tester' } },
} as unknown as StringJobCsvRow;

describe('stringJobsCsv', () => {
  it('writes each job with its customer, racquet, strings and dates', () => {
    const text = stringJobsCsv([job, { ...job, job_number: 1043, is_rush: false, paid_sale_id: 's1', customer_rackets: null }]);
    const [header, first, second] = text.split('\r\n');
    expect(header).toBe('Job,Customer,Racquet,Strings,Rush,Promised,Entered,Completed,Assigned to,Strung by,Price,Paid');
    expect(first).toMatch(/^J1042,"Tester, Pat",Head Speed MP,.*Luxilon.*,Yes,\d{4}-\d{2}-\d{2} \d{2}:\d{2},\d{4}-\d{2}-\d{2} \d{2}:\d{2},,Sam,,30,No$/);
    expect(second).toMatch(/^J1043,,,.*,No,.*,Yes$/);
  });
});
