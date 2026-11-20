import { describe, expect, it, vi } from 'vitest';

// A fake supabase: from().select().in() for the frames, rpc() for label codes.
let unitsResult: { data: unknown; error: unknown } = { data: [], error: null };
const rpc = vi.fn(async (..._args: unknown[]) => ({ data: 'U10001' as string | null, error: null as unknown }));
const query = { select: () => query, in: async () => unitsResult };
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => query, rpc: (...args: unknown[]) => rpc(...args) } }));

const { assignUnitLabels, buildUnitLabel, fetchUnitLabels, labelsPath } = await import('./unitLabel');

const frame = {
  id: 'u1',
  barcode: 'U10001',
  products: { brand: 'Head', name: 'Speed MP', attributes: { grip: '4 3/8', weight: '300 g', note: '' }, sell_price: 249 },
};

describe('buildUnitLabel', () => {
  it('says what the frame is, with its code and price', () => {
    expect(buildUnitLabel(frame)).toEqual({
      unitId: 'u1',
      code: 'U10001',
      title: 'Head Speed MP',
      details: '4 3/8 · 300 g',
      price: 249,
    });
  });

  it('has nothing to print without a barcode', () => {
    expect(buildUnitLabel({ ...frame, barcode: null })).toBeNull();
  });

  it('copes with a missing product', () => {
    expect(buildUnitLabel({ ...frame, products: null })).toMatchObject({ title: '—', details: '', price: null });
  });
});

describe('the labels page', () => {
  it('takes the frames in its address', () => {
    expect(labelsPath(['u1', 'u 2'])).toBe('/units/labels?ids=u1,u%202');
  });

  it('loads labels in the order asked, skipping frames without a barcode', async () => {
    unitsResult = { data: [{ ...frame, id: 'u2', barcode: 'RQ-9' }, frame, { ...frame, id: 'u3', barcode: null }], error: null };
    expect((await fetchUnitLabels(['u1', 'u2', 'u3', 'gone'])).map((label) => label.code)).toEqual(['U10001', 'RQ-9']);
  });

  it('says when the frames can\'t be read', async () => {
    unitsResult = { data: null, error: { message: 'offline' } };
    await expect(fetchUnitLabels(['u1'])).rejects.toThrow("Couldn't load the frames: offline");
  });
});

describe('assignUnitLabels', () => {
  it('gives each frame its code in turn', async () => {
    await assignUnitLabels(['u1', 'u2']);
    expect(rpc.mock.calls).toEqual([
      ['assign_unit_label', { p_unit_id: 'u1' }],
      ['assign_unit_label', { p_unit_id: 'u2' }],
    ]);
  });

  it('stops at a refusal', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Unknown unit u9' } });
    await expect(assignUnitLabels(['u9'])).rejects.toThrow('Unknown unit u9');
  });
});
