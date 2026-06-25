import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { LookupKind, LookupValue } from '../../types/domain';

// Loads a lookup kind's values and supports add-if-missing (via add_lookup_value).
export function useLookups(kind: LookupKind) {
  const [values, setValues] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('lookup_values')
      .select('*')
      .eq('kind', kind)
      .order('value');
    if (!error && data) {
      setValues((data as LookupValue[]).map((row) => row.value));
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  // Persist a new value (insert-if-missing) and merge into local list.
  const addValue = useCallback(
    async (raw: string): Promise<string> => {
      const trimmed = raw.trim();
      if (!trimmed) return '';
      const { data, error } = await supabase.rpc('add_lookup_value', {
        p_kind: kind,
        p_value: trimmed,
      });
      const canonical = (!error && typeof data === 'string' ? data : trimmed);
      setValues((current) =>
        current.includes(canonical) ? current : [...current, canonical].sort(),
      );
      return canonical;
    },
    [kind],
  );

  return { values, addValue };
}
