import { describe, expect, it } from 'vitest';
import type { Customer } from '../../types/domain';
import { decideJobLine, ownerWarnings, type TicketJob } from './ticketJobs';

const person = (id: string, first: string): Customer => ({
  id,
  first_name: first,
  last_name: 'Tester',
  phone_number: null,
  email: null,
  is_active: true,
  created_at: '',
  updated_at: '',
});
const pat = person('pat', 'Pat');
const sam = person('sam', 'Sam');
const samsJob: TicketJob = {
  id: 'job-1',
  price: 19,
  status: 'entered',
  paidSaleId: null,
  racketLabel: 'Wilson Blade 98',
  owner: sam,
};

describe('decideJobLine', () => {
  it('fills in the owner on a ticket with no customer', () => {
    expect(decideJobLine(samsJob, null, false)).toEqual({ kind: 'add', customerToSet: sam });
  });

  it('adds the owner’s own racquet without changing the customer', () => {
    expect(decideJobLine(samsJob, sam, false)).toEqual({ kind: 'add', customerToSet: null });
  });

  it('adds another customer’s racquet too (a family on one ticket)', () => {
    expect(decideJobLine(samsJob, pat, false)).toEqual({ kind: 'add', customerToSet: null });
  });

  it('adds a completed, unpaid job', () => {
    expect(decideJobLine({ ...samsJob, status: 'complete' }, pat, false).kind).toBe('add');
  });

  it('refuses a job that is paid, cancelled, picked up or already on the ticket', () => {
    expect(decideJobLine({ ...samsJob, paidSaleId: 'sale-1' }, pat, false)).toEqual({
      kind: 'refuse',
      message: 'The Wilson Blade 98 string job is already paid.',
    });
    expect(decideJobLine({ ...samsJob, status: 'cancelled' }, pat, false).kind).toBe('refuse');
    expect(decideJobLine({ ...samsJob, status: 'delivered' }, pat, false).kind).toBe('refuse');
    expect(decideJobLine(samsJob, pat, true)).toEqual({
      kind: 'refuse',
      message: 'Stringing for the Wilson Blade 98 is already on this ticket.',
    });
  });
});

describe('ownerWarnings', () => {
  const samsLine = { stringJobId: 'job-1', racketLabel: 'Wilson Blade 98', ownerCustomerId: 'sam', ownerName: 'Sam Tester' };
  const patsLine = { stringJobId: 'job-2', racketLabel: 'Babolat Pure Aero', ownerCustomerId: 'pat', ownerName: 'Pat Tester' };

  it('warns once for each racquet that isn’t the ticket customer’s', () => {
    expect(ownerWarnings([samsLine, patsLine, { stringJobId: undefined }], pat)).toEqual([
      'Stringing: Wilson Blade 98 is Sam Tester’s racquet. This ticket is for Pat Tester.',
    ]);
  });

  it('says nothing when every racquet is the customer’s, or there is no customer', () => {
    expect(ownerWarnings([patsLine], pat)).toEqual([]);
    expect(ownerWarnings([samsLine], null)).toEqual([]);
  });
});
