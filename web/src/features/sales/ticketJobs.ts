import type { Customer, StringJobStatus } from '../../types/domain';
import { customerName } from '../../types/domain';

/** A string job as the register needs it: what to charge and whose racquet it is. */
export interface TicketJob {
  id: string;
  price: number | null;
  status: StringJobStatus;
  paidSaleId: string | null;
  racketLabel: string;
  owner: Customer | null;
}

export type JobLineDecision =
  | { kind: 'add'; customerToSet: Customer | null }
  | { kind: 'refuse'; message: string };

/**
 * Whether a racquet's string job can go on the current ticket. A racquet that
 * belongs to someone other than the ticket's customer is still added (a family
 * paying on one ticket); the ticket shows a warning for it instead.
 */
export function decideJobLine(
  job: TicketJob,
  ticketCustomer: Customer | null,
  alreadyOnTicket: boolean,
): JobLineDecision {
  if (alreadyOnTicket) {
    return { kind: 'refuse', message: `Stringing for the ${job.racketLabel} is already on this ticket.` };
  }
  if (job.paidSaleId) {
    return { kind: 'refuse', message: `The ${job.racketLabel} string job is already paid.` };
  }
  if (job.status === 'cancelled') {
    return { kind: 'refuse', message: `The ${job.racketLabel} string job was cancelled, so it can’t be charged.` };
  }
  if (job.status === 'delivered') {
    return { kind: 'refuse', message: `The ${job.racketLabel} string job was already picked up.` };
  }
  // An unidentified ticket takes the racquet owner's name.
  return { kind: 'add', customerToSet: ticketCustomer ? null : job.owner };
}

/** The ticket line fields that remember whose racquet a stringing line is for. */
export interface JobLineOwner {
  stringJobId?: string;
  racketLabel?: string;
  ownerCustomerId?: string;
  ownerName?: string;
}

/** One warning per stringing line whose racquet isn't the ticket customer's. */
export function ownerWarnings(lines: JobLineOwner[], ticketCustomer: Customer | null): string[] {
  if (!ticketCustomer) return [];
  return lines
    .filter((l) => l.stringJobId && l.ownerCustomerId && l.ownerCustomerId !== ticketCustomer.id)
    .map(
      (l) =>
        `Stringing: ${l.racketLabel ?? 'racquet'} is ${l.ownerName ?? 'another customer'}’s racquet. ` +
        `This ticket is for ${customerName(ticketCustomer)}.`,
    );
}
