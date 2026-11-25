import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';

export interface ReportState<Row> {
  rows: Row[] | null;
  error: string | null;
  retry: () => void;
}

/**
 * Runs a report function and keeps its rows. `args` null means "not ready"
 * (e.g. a custom range without both days). A slow answer for earlier
 * arguments never replaces a newer one.
 */
export function useReport<Row>(fn: string, args: Record<string, unknown> | null): ReportState<Row> {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadCount, setLoadCount] = useState(0);
  const startRequest = useLatestRequest();
  const argsKey = args === null ? null : JSON.stringify(args);

  useEffect(() => {
    setRows(null);
    setError(null);
    if (argsKey === null) return;
    const isLatest = startRequest();
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc(fn, JSON.parse(argsKey));
      if (!isLatest()) return;
      if (rpcError) setError(`Couldn't load the report: ${errorMessage(rpcError)}`);
      else setRows((data ?? []) as Row[]);
    })();
  }, [fn, argsKey, loadCount, startRequest]);

  const retry = useCallback(() => setLoadCount((count) => count + 1), []);
  return { rows, error, retry };
}

/** A [from, to) range as the report functions take it. */
export function rangeArgs(range: { from: Date; to: Date } | null): { p_from: string; p_to: string } | null {
  return range ? { p_from: range.from.toISOString(), p_to: range.to.toISOString() } : null;
}
