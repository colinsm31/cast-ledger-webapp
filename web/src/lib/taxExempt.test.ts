import { describe, expect, it } from 'vitest';
import { exemptionChanged, parseTaxExemption, taxExemptLabel, taxRateFor } from './taxExempt';

describe('parseTaxExemption', () => {
  it('clears the ID when the customer isn’t exempt', () => {
    expect(parseTaxExemption(false, 'TX-1')).toEqual({ tax_exempt: false, tax_exempt_id: null });
  });

  it('needs a trimmed certificate number up to 50 characters', () => {
    expect(parseTaxExemption(true, '  TX-1 ')).toEqual({ tax_exempt: true, tax_exempt_id: 'TX-1' });
    expect(parseTaxExemption(true, '   ')).toEqual({ error: 'Tax exempt: enter the exemption certificate number.' });
    expect(parseTaxExemption(true, 'x'.repeat(51))).toHaveProperty('error');
  });
});

describe('exemptionChanged', () => {
  it('spots a new, ended or renumbered exemption', () => {
    const none = { tax_exempt: false, tax_exempt_id: null };
    const exempt = { tax_exempt: true, tax_exempt_id: 'TX-1' };
    expect(exemptionChanged(none, none)).toBe(false);
    expect(exemptionChanged({}, none)).toBe(false);
    expect(exemptionChanged(exempt, exempt)).toBe(false);
    expect(exemptionChanged(none, exempt)).toBe(true);
    expect(exemptionChanged(exempt, none)).toBe(true);
    expect(exemptionChanged(exempt, { tax_exempt: true, tax_exempt_id: 'TX-2' })).toBe(true);
  });
});

describe('taxExemptLabel and taxRateFor', () => {
  it('names an exempt customer and charges them nothing', () => {
    const exempt = { tax_exempt: true, tax_exempt_id: 'TX-1' };
    expect(taxExemptLabel(exempt)).toBe('Tax exempt · TX-1');
    expect(taxExemptLabel({ tax_exempt: false, tax_exempt_id: null })).toBeNull();
    expect(taxExemptLabel(null)).toBeNull();
    expect(taxRateFor(8.25, exempt)).toBe(0);
    expect(taxRateFor(8.25, null)).toBe(8.25);
  });
});
