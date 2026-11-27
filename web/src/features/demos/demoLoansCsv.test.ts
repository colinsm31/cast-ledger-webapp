import { describe, expect, it } from 'vitest';
import { demoLoansCsv, demoLoansFileName } from './demoLoansCsv';
import type { LoanWithFrame } from './demoLoanQueries';

const loan = {
  id: 'l1', loan_number: 1001, product_unit_id: 'u1', customer_id: 'c1', out_at: '2026-11-20T15:00:00Z', out_by: null,
  due_back_at: '2026-11-23T15:00:00Z', deposit_note: 'Card on file', note: null, back_at: '2026-11-22T15:00:00Z',
  back_by: null, back_status: 'retired', back_reason: 'Cracked', sale_id: null,
  customers: { id: 'c1', first_name: 'Pat', last_name: 'Tester', phone_number: null },
  product_units: { id: 'u1', barcode: 'DEMO-1', product_id: 'p1', products: { brand: 'Head', name: 'Speed MP' } },
} as LoanWithFrame;

describe('demoLoansCsv', () => {
  it('writes each loan with the racquet, customer, dates and outcome', () => {
    const [header, row, other] = demoLoansCsv([loan, { ...loan, back_at: null, back_status: null, back_reason: null, sale_id: 's1', customers: null, product_units: null }]).split('\r\n');
    expect(header).toBe('Loan,Racquet,Frame barcode,Customer,Out,Due back,Back,Back to,Reason,Deposit,Note,Led to a sale');
    expect(row).toMatch(/^D1001,Head Speed MP,DEMO-1,"Tester, Pat",[\d-]+ [\d:]+,[\d-]+ [\d:]+,[\d-]+ [\d:]+,Retired,Cracked,Card on file,,No$/);
    expect(other).toMatch(/^D1001,Racquet,,,.*,,,,Card on file,,Yes$/);
  });
  it('names the file for today', () => {
    expect(demoLoansFileName('out')).toMatch(/^demos-out_\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
