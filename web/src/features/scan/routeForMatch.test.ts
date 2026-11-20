import { describe, expect, it } from 'vitest';
import { routeForMatch } from './resolveBarcode';

describe('routeForMatch', () => {
  it('opens a string job from its tag', () => {
    expect(routeForMatch({ kind: 'job', code: 'J1042', jobId: 'j1', customerId: 'c1' })).toBe('/string-jobs/j1');
  });

  it('opens a racquet\'s open job, or starts a restring', () => {
    expect(routeForMatch({ kind: 'racket', code: 'TAG-1', racketId: 'r1', customerId: 'c1', openJobId: 'j1' })).toBe(
      '/string-jobs/j1',
    );
    expect(routeForMatch({ kind: 'racket', code: 'TAG-1', racketId: 'r1', customerId: 'c1', openJobId: null })).toBe(
      '/customers/c1/rackets/r1/restring',
    );
  });

  it('goes nowhere for an unknown code', () => {
    expect(routeForMatch({ kind: 'none', code: 'X' })).toBeNull();
  });
});
