import { describe, expect, it, vi } from 'vitest';
import type { Settings, SettingsForm } from './settings';

// A fake `supabase.from('settings').select().eq().maybeSingle()` returning `result`.
let result: { data: unknown; error: unknown } = { data: null, error: null };
const query = { select: () => query, eq: () => query, maybeSingle: async () => result };
vi.mock('./supabase', () => ({ supabase: { from: () => query } }));

const { fetchSettings, parseSettingsForm, settingsToForm } = await import('./settings');

const saved: Settings = {
  tax_rate: 8.25,
  tax_stringing: false,
  stringing_labor: 18,
  default_reorder_point: 2,
  block_oversell: true,
  week_starts_monday: false,
  accept_checks: false,
  staff_discount_cap: 20,
  shop_name: 'Ace Racquets',
  shop_address: '12 Court St\nSpringfield',
  return_policy: null,
  receipt_footer: null,
};

function form(changes: Partial<SettingsForm>): SettingsForm {
  return { ...settingsToForm(saved), ...changes };
}

describe('parseSettingsForm', () => {
  it('round-trips saved settings', () => {
    expect(parseSettingsForm(settingsToForm(saved))).toEqual({ settings: saved });
  });

  it('refuses a tax rate that isn\'t a plain number from 0 to 100', () => {
    for (const taxRate of ['8.25%', 'abc', '', '-1', '100.5', '1e2']) {
      expect(parseSettingsForm(form({ taxRate }))).toEqual({
        error: 'Sales tax rate: enter a number from 0 to 100, like 8.25.',
      });
    }
  });

  it('allows 0, 100 and up to 3 decimal places of tax', () => {
    for (const taxRate of ['0', '100', ' 8.875 ', '8.2500']) {
      expect(parseSettingsForm(form({ taxRate }))).toHaveProperty('settings');
    }
    expect(parseSettingsForm(form({ taxRate: '8.2501' }))).toEqual({
      error: 'Sales tax rate: use at most 3 decimal places.',
    });
  });

  it('trims the receipt text, saves blank as none, and limits its length', () => {
    expect(parseSettingsForm(form({ shopName: '  Ace  ', receiptFooter: '   ' }))).toMatchObject({
      settings: { shop_name: 'Ace', receipt_footer: null },
    });
    expect(parseSettingsForm(form({ shopName: 'x'.repeat(101) }))).toEqual({
      error: 'Shop name: use at most 100 characters.',
    });
    expect(parseSettingsForm(form({ returnPolicy: 'x'.repeat(1001) }))).toEqual({
      error: 'Return policy: use at most 1000 characters.',
    });
  });

  it('needs a staff discount limit from 0 to 100, to the hundredth', () => {
    for (const staffDiscountCap of ['', '20%', '-5', '100.5']) {
      expect(parseSettingsForm(form({ staffDiscountCap }))).toEqual({
        error: 'Staff discount limit: enter a percent from 0 to 100, like 20.',
      });
    }
    expect(parseSettingsForm(form({ staffDiscountCap: '12.505' }))).toEqual({
      error: 'Staff discount limit: use at most 2 decimal places.',
    });
    expect(parseSettingsForm(form({ staffDiscountCap: ' 0 ' }))).toHaveProperty('settings.staff_discount_cap', 0);
    expect(parseSettingsForm(form({ staffDiscountCap: '100' }))).toHaveProperty('settings.staff_discount_cap', 100);
  });

  it('needs a labor charge in whole cents, 0 for none', () => {
    expect(parseSettingsForm(form({ stringingLabor: '' }))).toHaveProperty('error');
    expect(parseSettingsForm(form({ stringingLabor: '$18' }))).toHaveProperty('error');
    expect(parseSettingsForm(form({ stringingLabor: '18.005' }))).toEqual({
      error: 'Base labor charge: use at most 2 decimal places.',
    });
    expect(parseSettingsForm(form({ stringingLabor: '0' }))).toHaveProperty('settings.stringing_labor', 0);
  });

  it('takes an empty or whole-number reorder point', () => {
    expect(parseSettingsForm(form({ defaultReorder: '' }))).toHaveProperty('settings.default_reorder_point', null);
    for (const defaultReorder of ['1.5', '-1', 'two']) {
      expect(parseSettingsForm(form({ defaultReorder }))).toEqual({
        error: 'Default reorder point: enter a whole number, or leave it empty.',
      });
    }
  });
});

describe('fetchSettings', () => {
  it('reads the settings row, with numbers as numbers', async () => {
    result = {
      data: { ...saved, tax_rate: '8.250', stringing_labor: '18.00', default_reorder_point: null, staff_discount_cap: '20.00' },
      error: null,
    };
    await expect(fetchSettings()).resolves.toEqual({ ...saved, default_reorder_point: null });
  });

  it('fails rather than falling back to 0% tax', async () => {
    result = { data: null, error: { message: 'permission denied for table settings' } };
    await expect(fetchSettings()).rejects.toThrow(
      "Couldn't load the shop settings: permission denied for table settings",
    );
    result = { data: null, error: null };
    await expect(fetchSettings()).rejects.toThrow('the settings row is missing');
  });
});
