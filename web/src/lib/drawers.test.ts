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

    result = { data: { ...row, closed_at: '2026-11-28T01:00:00Z', counted_cash: '132.50' }, error: null };
    await expect(drawers.fetchSession('s-1')).resolves.toMatchObject({ float_amount: 110, counted_cash: 132.5 });
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

describe('this device\'s drawer', () => {
  const main = { id: 'd-1', name: 'Main drawer', is_active: true };
  const back = { id: 'd-2', name: 'Back counter', is_active: true };

  it('is the remembered one while it is in use, else the only one in use', () => {
    expect(drawers.chooseDeviceDrawer([main, back], 'd-2')).toBe(back);
    expect(drawers.chooseDeviceDrawer([main, back], null)).toBeNull();
    expect(drawers.chooseDeviceDrawer([main, { ...back, is_active: false }], 'd-2')).toBe(main);
  });

  it('is remembered on the device', () => {
    expect(drawers.rememberedDrawerId()).toBeNull();
    drawers.rememberDrawer('d-2');
    expect(drawers.rememberedDrawerId()).toBe('d-2');
  });
});
