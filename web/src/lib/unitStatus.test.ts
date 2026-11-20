import { describe, expect, it } from 'vitest';
import { statusText, unitChangeLabel, unitMoves, unitReasonProblem } from './unitStatus';

describe('unitMoves', () => {
  it('offers demo and retire for a frame in stock', () => {
    expect(unitMoves('in_stock').map((move) => move.to)).toEqual(['demo', 'retired']);
  });

  it('brings demo and retired frames back', () => {
    expect(unitMoves('demo').map((move) => move.label)).toEqual(['Back in stock', 'Retire']);
    expect(unitMoves('retired').map((move) => move.label)).toEqual(['Back in stock']);
  });

  it('offers nothing for a sold or assigned frame', () => {
    expect(unitMoves('sold')).toEqual([]);
    expect(unitMoves('assigned')).toEqual([]);
  });
});

describe('unitReasonProblem', () => {
  it('needs a reason of at most 200 characters', () => {
    expect(unitReasonProblem('  ')).toBe('Give a reason.');
    expect(unitReasonProblem('x'.repeat(201))).toBe('Keep the reason to 200 characters.');
    expect(unitReasonProblem(' Cracked throat ')).toBeNull();
  });
});

describe('unitChangeLabel', () => {
  const change = (from_status: string | null, to_status: string, refund_id: string | null = null) =>
    ({ from_status, to_status, refund_id }) as Parameters<typeof unitChangeLabel>[0];

  it('names each kind of change', () => {
    expect(unitChangeLabel(change(null, 'in_stock'))).toBe('Received');
    expect(unitChangeLabel(change(null, 'sold'))).toBe('Recorded as sold');
    expect(unitChangeLabel(change('in_stock', 'sold'))).toBe('Sold');
    expect(unitChangeLabel(change('in_stock', 'demo'))).toBe('Moved to demo');
    expect(unitChangeLabel(change('demo', 'retired'))).toBe('Retired');
    expect(unitChangeLabel(change('retired', 'in_stock'))).toBe('Back in stock');
    expect(unitChangeLabel(change('demo', 'assigned'))).toBe('Now assigned');
  });

  it('names a return', () => {
    expect(unitChangeLabel(change('sold', 'in_stock', 'r1'))).toBe('Returned');
    expect(unitChangeLabel(change('sold', 'retired', 'r1'))).toBe('Returned damaged, retired');
  });

  it('writes a status as words', () => {
    expect(statusText('in_stock')).toBe('in stock');
  });
});
