import { describe, expect, it } from 'vitest';
import type { StringJob } from '../../types/domain';
import { stringSummary } from './stringSummary';

// Only the string fields matter to the summary.
function job(fields: Partial<StringJob>): StringJob {
  return {
    main_brand: null,
    main_string: null,
    main_specs: {},
    main_tension: null,
    cross_brand: null,
    cross_string: null,
    cross_specs: {},
    cross_tension: null,
    ...fields,
  } as StringJob;
}

describe('stringSummary', () => {
  it('describes a single-string job on one side', () => {
    const mains = { brand: 'Luxilon', name: 'ALU Power', specs: { gauge: '16L' }, tension: 52 };
    expect(
      stringSummary(
        job({
          main_brand: mains.brand,
          main_string: mains.name,
          main_specs: mains.specs,
          main_tension: mains.tension,
          cross_brand: mains.brand,
          cross_string: mains.name,
          cross_specs: mains.specs,
          cross_tension: mains.tension,
        }),
      ),
    ).toBe('Luxilon ALU Power 16L @52');
  });

  it('shows mains / crosses for a hybrid', () => {
    expect(
      stringSummary(
        job({
          main_brand: 'Luxilon',
          main_string: 'ALU Power',
          main_specs: { gauge: '16L' },
          main_tension: 52,
          cross_brand: 'Wilson',
          cross_string: 'NXT',
          cross_specs: { gauge: '16' },
          cross_tension: 55,
        }),
      ),
    ).toBe('Luxilon ALU Power 16L @52 / Wilson NXT 16 @55');
  });

  it('skips empty spec values', () => {
    expect(
      stringSummary(job({ main_string: 'Synthetic Gut', main_specs: { gauge: '', color: null } })),
    ).toBe('Synthetic Gut');
  });

  it('shows crosses alone when there are no mains', () => {
    expect(stringSummary(job({ cross_string: 'NXT', cross_tension: 50 }))).toBe('NXT @50');
  });

  it('shows a dash when nothing is recorded', () => {
    expect(stringSummary(job({}))).toBe('—');
  });
});
