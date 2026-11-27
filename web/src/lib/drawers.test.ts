// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

// A fake query builder: every filter returns itself; awaiting it (or single())
// gives `result`.
let result: { data: unknown; error: unknown } = { data: null, error: null };
const from = vi.fn();
const query = {
  select: vi.fn(() => query),
  order: vi.fn(() => query),
  is: vi.fn(() => query),
  eq: vi.fn(() => query),
  single: vi.fn(async () => result),
  then: (resolve: (value: unknown) => void) => resolve(result),
};
const rpc = vi.fn(async () => result);
vi.mock('./supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => {
      from(...args);
      return query;
    },
    rpc: (...args: unknown[]) => rpc(...(args as [])),
  },
}));

const drawers = await import('./drawers');

const row = {
  id: 's-1',
  drawer_id: 'd-1',
  business_day: '2026-11-27',
  opened_at: '2026-11-27T15:00:00Z',
  opened_by: 'u1',
  float_amount: '110.00',
  closed_at: null,
  counted_cash: null,
  expected_cash: null,
  close_note: null,
};

afterEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  result = { data: null, error: null };
});

describe('drawer data', () => {
  it('loads drawers by name and open sessions with amounts as numbers', async () => {
    result = { data: [{ id: 'd-1', name: 'Main drawer', is_active: true }], error: null };
    await expect(drawers.fetchDrawers()).resolves.toEqual([{ id: 'd-1', name: 'Main drawer', is_active: true }]);
    expect(query.order).toHaveBeenCalledWith('name');

    result = { data: [row], error: null };
    await expect(drawers.fetchOpenSessions()).resolves.toEqual([{ ...row, float_amount: 110 }]);
    expect(query.is).toHaveBeenCalledWith('closed_at', null);

    result = { data: { ...row, closed_at: '2026-11-28T01:00:00Z', counted_cash: '132.50', expected_cash: '132.65' }, error: null };
    await expect(drawers.fetchSession('s-1')).resolves.toMatchObject({ float_amount: 110, counted_cash: 132.5, expected_cash: 132.65 });
  });

  it('says what failed to load', async () => {
    result = { data: null, error: { message: 'offline' } };
    await expect(drawers.fetchDrawers()).rejects.toThrow("Couldn't load the drawers: offline");
    await expect(drawers.fetchOpenSessions()).rejects.toThrow("Couldn't load the open drawers: offline");
    await expect(drawers.fetchSession('s-1')).rejects.toThrow("Couldn't load the drawer: offline");
  });

  it('opens and closes a drawer through the server functions', async () => {
    result = { data: 's-9', error: null };
    await expect(drawers.openDrawer('d-1', { '20': 5 })).resolves.toBe('s-9');
    expect(rpc).toHaveBeenCalledWith('open_drawer', { p_drawer_id: 'd-1', p_counts: { '20': 5 } });
    result = { data: null, error: null };
    await drawers.closeDrawer('s-9', { '20': 6 }, 'ok');
    expect(rpc).toHaveBeenCalledWith('close_drawer', { p_session_id: 's-9', p_counts: { '20': 6 }, p_note: 'ok' });
    result = { data: null, error: { message: 'Main drawer is already open' } };
    await expect(drawers.openDrawer('d-1', {})).rejects.toThrow('Main drawer is already open');
    await expect(drawers.closeDrawer('s-9', {}, '')).rejects.toThrow('Main drawer is already open');
  });
});

describe('expected cash', () => {
  it('loads what an open drawer should hold, as numbers', async () => {
    rpc.mockReturnValueOnce({ single: async () => ({
      data: { float_amount: '100', cash_sales: '43.30', cash_refunds: '21.65', paid_in: '25', paid_out: '6.50', expected_cash: '140.15', check_sales: '21.65', check_refunds: '0' },
      error: null,
    }) } as never);
    await expect(drawers.fetchCashSummary('s-1')).resolves.toEqual({
      float_amount: 100, cash_sales: 43.3, cash_refunds: 21.65, paid_in: 25, paid_out: 6.5, expected_cash: 140.15, check_sales: 21.65, check_refunds: 0,
    });
    expect(rpc).toHaveBeenCalledWith('drawer_cash_summary', { p_session_id: 's-1' });
    rpc.mockReturnValueOnce({ single: async () => ({ data: null, error: { message: 'offline' } }) } as never);
    await expect(drawers.fetchCashSummary('s-1')).rejects.toThrow("Couldn't work out the drawer's cash: offline");
  });

  it('loads and records paid-ins and paid-outs', async () => {
    result = { data: [{ id: 'm1', kind: 'paid_in', amount: '25.00', reason: null, created_at: '2026-11-27T16:00:00Z' }], error: null };
    await expect(drawers.fetchMovements('s-1')).resolves.toEqual([
      { id: 'm1', kind: 'paid_in', amount: 25, reason: null, created_at: '2026-11-27T16:00:00Z' },
    ]);
    expect(query.eq).toHaveBeenCalledWith('drawer_session_id', 's-1');
    result = { data: null, error: { message: 'offline' } };
    await expect(drawers.fetchMovements('s-1')).rejects.toThrow("Couldn't load the paid-ins and paid-outs: offline");

    result = { data: 'm2', error: null };
    await drawers.recordMovement('s-1', 'paid_out', 6.5, '  ');
    expect(rpc).toHaveBeenCalledWith('record_drawer_movement', { p_session_id: 's-1', p_kind: 'paid_out', p_amount: 6.5, p_reason: null });
    result = { data: null, error: { message: 'The drawer should only hold $10.00' } };
    await expect(drawers.recordMovement('s-1', 'paid_out', 99, 'Stamps')).rejects.toThrow('The drawer should only hold $10.00');
  });

  it('checks a paid-in or paid-out amount', () => {
    expect(drawers.parseMovementAmount(' 6.50 ')).toEqual({ amount: 6.5 });
    expect(drawers.parseMovementAmount('0')).toEqual({ error: 'Amount: enter an amount over $0, like 20.00.' });
    expect(drawers.parseMovementAmount('$5')).toEqual({ error: 'Amount: enter an amount over $0, like 20.00.' });
    expect(drawers.parseMovementAmount('1.005')).toEqual({ error: 'Amount: use at most 2 decimal places.' });
  });

  it('says over, short or even', () => {
    expect(drawers.overShort(121.5, 121.65)).toBe(-0.15);
    expect(drawers.overShort(null, 10)).toBeNull();
    expect(drawers.overShortLabel(-0.15)).toBe('Short $0.15');
    expect(drawers.overShortLabel(1)).toBe('Over $1.00');
    expect(drawers.overShortLabel(0)).toBe('Even');
  });
});

describe('this device\'s drawer', () => {
  const main = { id: 'd-1', name: 'Main drawer', is_active: true };
  const back = { id: 'd-2', name: 'Back counter', is_active: true };

  it('is the remembered one while it is in use, else the only one in use', () => {
    expect(drawers.chooseDeviceDrawer([main, back], 'd-2')).toBe(back);
    expect(drawers.chooseDeviceDrawer([main, back], null)).toBeNull();
    expect(drawers.chooseDeviceDrawer([main, { ...back, is_active: false }], 'd-2')).toBe(main);
  });

  it('is open, closed, or still to be chosen at the register', () => {
    expect(drawers.registerDrawerState([main], ['d-1'], null)).toBe('open');
    expect(drawers.registerDrawerState([main], [], null)).toBe('closed');
    expect(drawers.registerDrawerState([main, back], ['d-2'], null)).toBe('open');
    expect(drawers.registerDrawerState([main, back], ['d-1', 'd-2'], null)).toBe('choose');
    expect(drawers.registerDrawerState([main, back], [], null)).toBe('closed');
    expect(drawers.registerDrawerState([main, back], ['d-1'], 'd-2')).toBe('closed');
  });

  it('marks money requests with the remembered drawer, when the request can carry it', () => {
    const request = { setHeader: vi.fn(function (this: unknown) { return this; }) };
    expect(drawers.withRegisterDrawer(request)).toBe(request);
    expect(request.setHeader).not.toHaveBeenCalled();
    drawers.rememberDrawer('d-2');
    drawers.withRegisterDrawer(request);
    expect(request.setHeader).toHaveBeenCalledWith('x-acestock-drawer', 'd-2');
    const plainPromise = Promise.resolve();
    expect(drawers.withRegisterDrawer(plainPromise)).toBe(plainPromise);
  });

  it('is remembered on the device', () => {
    expect(drawers.rememberedDrawerId()).toBeNull();
    drawers.rememberDrawer('d-2');
    expect(drawers.rememberedDrawerId()).toBe('d-2');
  });
});
