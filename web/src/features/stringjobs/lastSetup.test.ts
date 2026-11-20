import { describe, expect, it } from 'vitest';
import { setupToRows } from './lastSetup';
import type { StringSetup } from './stringSummary';

const blank: StringSetup = {
  main_brand: null,
  main_string: null,
  main_specs: {},
  main_tension: null,
  main_customer_supplied: false,
  cross_brand: null,
  cross_string: null,
  cross_specs: {},
  cross_tension: null,
  cross_customer_supplied: false,
};
const rpm = { main_brand: 'Babolat', main_string: 'RPM Blast', main_specs: { color: 'Black', gauge: '16' }, main_tension: 55 };

describe('setupToRows', () => {
  it('fills both rows with the same string, still copying the mains', () => {
    const rows = setupToRows({
      ...blank,
      ...rpm,
      cross_brand: 'Babolat',
      cross_string: 'RPM Blast',
      cross_specs: { color: 'Black', gauge: '16' },
      cross_tension: 55,
    });
    expect(rows.mains).toEqual({ brand: 'Babolat', name: 'RPM Blast', specs: { color: 'Black', gauge: '16' }, tension: '55', customer: false });
    expect(rows.crosses).toEqual(rows.mains);
    expect(rows.crossStringEdited).toBe(false);
    expect(rows.crossTensionEdited).toBe(false);
  });

  it('keeps a hybrid and a different cross tension apart from the mains', () => {
    const rows = setupToRows({
      ...blank,
      ...rpm,
      cross_brand: 'Luxilon',
      cross_string: 'ALU Power',
      cross_tension: 52,
      cross_customer_supplied: true,
    });
    expect(rows.crosses).toEqual({ brand: 'Luxilon', name: 'ALU Power', specs: {}, tension: '52', customer: true });
    expect(rows.crossStringEdited).toBe(true);
    expect(rows.crossTensionEdited).toBe(true);
  });

  it('strings the crosses like the mains when none were recorded', () => {
    const rows = setupToRows({ ...blank, ...rpm });
    expect(rows.crosses).toEqual(rows.mains);
    expect(rows.crossStringEdited).toBe(false);
  });
});
