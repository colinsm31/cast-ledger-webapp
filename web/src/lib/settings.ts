import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export interface Settings {
  tax_rate: number; // percent
  tax_stringing: boolean;
  stringing_labor: number;
  default_reorder_point: number | null;
  block_oversell: boolean;
  week_starts_monday: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  tax_rate: 0,
  tax_stringing: false,
  stringing_labor: 0,
  default_reorder_point: null,
  block_oversell: false,
  week_starts_monday: false,
};

interface SettingsRow {
  tax_rate: number | string;
  tax_stringing: boolean;
  stringing_labor: number | string;
  default_reorder_point: number | null;
  block_oversell: boolean;
  week_starts_monday: boolean;
}

export async function fetchSettings(): Promise<Settings> {
  const { data } = await supabase.from('settings').select('*').eq('id', true).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
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

// Reactive settings (null while loading).
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let active = true;
    void fetchSettings().then((s) => {
      if (active) setSettings(s);
    });
    return () => {
      active = false;
    };
  }, []);
  return settings;
}
