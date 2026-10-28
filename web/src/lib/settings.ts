import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { errorMessage } from './errors';
import { hasSubCent } from './money';

export interface Settings {
  tax_rate: number; // percent
  tax_stringing: boolean;
  stringing_labor: number;
  default_reorder_point: number | null;
  block_oversell: boolean;
  week_starts_monday: boolean;
}

interface SettingsRow {
  tax_rate: number | string;
  tax_stringing: boolean;
  stringing_labor: number | string;
  default_reorder_point: number | null;
  block_oversell: boolean;
  week_starts_monday: boolean;
}

export const SETTINGS_LOAD_ERROR = "Couldn't load the shop settings";

// Throws if the settings can't be read: there are no defaults to fall back on,
// so a failed load never shows up as 0% tax (code review #11).
export async function fetchSettings(): Promise<Settings> {
  const { data, error } = await supabase.from('settings').select('*').eq('id', true).maybeSingle();
  if (error) throw new Error(`${SETTINGS_LOAD_ERROR}: ${errorMessage(error)}`);
  if (!data) throw new Error(`${SETTINGS_LOAD_ERROR}: the settings row is missing.`);
  const r = data as SettingsRow;
  return {
    tax_rate: Number(r.tax_rate),
    tax_stringing: r.tax_stringing,
    stringing_labor: Number(r.stringing_labor),
    default_reorder_point: r.default_reorder_point ?? null,
    block_oversell: r.block_oversell,
    week_starts_monday: r.week_starts_monday,
  };
}

export interface SettingsState {
  /** Null until the first successful load. */
  settings: Settings | null;
  /** The last load's error; the last good settings are kept. */
  error: string | null;
  reload: () => void;
}

// Reactive settings, reloaded whenever the window regains focus so a page left
// open picks up changes made elsewhere.
export function useSettings(): SettingsState {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const reload = useCallback(() => setLoadCount((count) => count + 1), []);

  useEffect(() => {
    let active = true;
    fetchSettings().then(
      (loaded) => {
        if (!active) return;
        setSettings(loaded);
        setError(null);
      },
      (err: unknown) => {
        if (active) setError(errorMessage(err));
      },
    );
    return () => {
      active = false;
    };
  }, [loadCount]);

  useEffect(() => {
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);

  return { settings, error, reload };
}

// ---------------------------------------------------------------------------
// The settings form: typed text checked strictly, so "8.25%" is refused rather
// than saved as 0. The limits match the database's (0047).
// ---------------------------------------------------------------------------

export interface SettingsForm {
  taxRate: string;
  taxStringing: boolean;
  stringingLabor: string;
  defaultReorder: string;
  blockOversell: boolean;
  weekStartsMonday: boolean;
}

const PLAIN_NUMBER = /^\d+(\.\d+)?$/;
const WHOLE_NUMBER = /^\d+$/;

function decimals(text: string): number {
  return /\.(\d*?)0*$/.exec(text)?.[1].length ?? 0;
}

export function settingsToForm(settings: Settings): SettingsForm {
  return {
    taxRate: String(settings.tax_rate),
    taxStringing: settings.tax_stringing,
    stringingLabor: String(settings.stringing_labor),
    defaultReorder: settings.default_reorder_point != null ? String(settings.default_reorder_point) : '',
    blockOversell: settings.block_oversell,
    weekStartsMonday: settings.week_starts_monday,
  };
}

/** The settings to save, or a message saying what's wrong with the form. */
export function parseSettingsForm(form: SettingsForm): { settings: Settings } | { error: string } {
  const taxRate = form.taxRate.trim();
  if (!PLAIN_NUMBER.test(taxRate) || Number(taxRate) > 100) {
    return { error: 'Sales tax rate: enter a number from 0 to 100, like 8.25.' };
  }
  if (decimals(taxRate) > 3) {
    return { error: 'Sales tax rate: use at most 3 decimal places.' };
  }

  const stringingLabor = form.stringingLabor.trim();
  if (!PLAIN_NUMBER.test(stringingLabor)) {
    return { error: 'Base labor charge: enter an amount, like 18.00 (0 for none).' };
  }
  if (hasSubCent(stringingLabor)) {
    return { error: 'Base labor charge: use at most 2 decimal places.' };
  }

  const defaultReorder = form.defaultReorder.trim();
  if (defaultReorder && !WHOLE_NUMBER.test(defaultReorder)) {
    return { error: 'Default reorder point: enter a whole number, or leave it empty.' };
  }

  return {
    settings: {
      tax_rate: Number(taxRate),
      tax_stringing: form.taxStringing,
      stringing_labor: Number(stringingLabor),
      default_reorder_point: defaultReorder ? Number(defaultReorder) : null,
      block_oversell: form.blockOversell,
      week_starts_monday: form.weekStartsMonday,
    },
  };
}
