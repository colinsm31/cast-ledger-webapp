import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const results = new Map<string, { data: unknown; error: unknown }>();
function table(name: string) {
  const query = {
    select: () => query,
    in: () => Promise.resolve(results.get(name)),
    eq: () => query,
    gt: () => query,
    order: () => Promise.resolve(results.get(name)),
    maybeSingle: () => Promise.resolve(results.get(name)),
  };
  return query;
}
vi.mock('./supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args), from: (name: string) => table(name) },
}));

const { currentListPrices, defaultHoldName, heldItemsLabel, holdTicket, listHeldTickets, recallHeldTicket } =
  await import('./heldTickets');

const content = {
  lines: [{ key: 'k1', productId: 'p1', label: 'Overgrip', price: '5', qty: 2 }],
  stringJobId: null,
  deliverAfter: false,
};

beforeEach(() => {
  rpc.mockReset();
  results.clear();
});

describe('defaultHoldName and heldItemsLabel', () => {
  it('names the ticket for its customer, or the time', () => {
    expect(defaultHoldName({ first_name: 'Pat', last_name: 'Rally' })).toBe('Pat Rally');
    expect(defaultHoldName(null, new Date(2026, 10, 12, 15, 41))).toMatch(/^Ticket 3:41/);
  });

  it('counts the items', () => {
    expect(heldItemsLabel(content)).toBe('2 items');
    expect(heldItemsLabel({ lines: [{ ...content.lines[0], qty: 1 }] })).toBe('1 item');
  });
});

describe('holdTicket and recallHeldTicket', () => {
  it('holds the ticket under its name and customer', async () => {
    rpc.mockResolvedValue({ data: 'h1', error: null });
    await expect(holdTicket('Pat', 'c1', content)).resolves.toBe('h1');
    expect(rpc).toHaveBeenCalledWith('hold_ticket', { p_name: 'Pat', p_customer_id: 'c1', p_ticket: content });
  });

  it('recalls the ticket with its customer read fresh', async () => {
    rpc.mockResolvedValue({ data: { name: 'Pat', customer_id: 'c1', ticket: content }, error: null });
    results.set('customers', { data: { id: 'c1', first_name: 'Pat', tax_exempt: true }, error: null });
    await expect(recallHeldTicket('h1')).resolves.toEqual({
      name: 'Pat',
      customer: { id: 'c1', first_name: 'Pat', tax_exempt: true },
      content,
    });
    expect(rpc).toHaveBeenCalledWith('recall_held_ticket', { p_id: 'h1' });
  });

  it('passes on another register getting it first', async () => {
    const failure = { message: 'That held ticket was recalled at another register or has expired' };
    rpc.mockResolvedValue({ data: null, error: failure });
    await expect(recallHeldTicket('h1')).rejects.toBe(failure);
  });
});

describe('listHeldTickets', () => {
  it('returns the unexpired tickets', async () => {
    results.set('held_tickets', { data: [{ id: 'h1', name: 'Pat' }], error: null });
    await expect(listHeldTickets()).resolves.toEqual([{ id: 'h1', name: 'Pat' }]);
  });
});

describe('currentListPrices', () => {
  it('reads each line’s catalog or string job price, in ticket order', async () => {
    results.set('products', { data: [{ id: 'p1', sell_price: 6 }], error: null });
    results.set('string_jobs', { data: [{ id: 'j1', price: '32.00' }], error: null });
    await expect(
      currentListPrices([{ productId: 'p1' }, { stringJobId: 'j1' }, { giftCardId: 'g1' }, { productId: 'gone' }]),
    ).resolves.toEqual([6, 32, null, null]);
  });

  it('asks nothing for a ticket of gift cards', async () => {
    await expect(currentListPrices([{ giftCardId: 'g1' }])).resolves.toEqual([null]);
  });
});
