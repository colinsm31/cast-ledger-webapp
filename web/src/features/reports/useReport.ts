import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { errorMessage } from '../../lib/errors';
import { useLatestRequest } from '../../lib/latestRequest';
import { fetchAllPages } from '../../lib/paging';

export interface ReportState<Row> {
  rows: Row[] | null;
  error: string | null;
  retry: () => void;
}

/**
 * Runs a report function and keeps all its rows, page by page (PostgREST
 * returns at most 1000 at a time). `args` null means "not ready" (e.g. a
 * custom range without both days). A slow answer for earlier arguments never
 * replaces a newer one.
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
    const parsedArgs = JSON.parse(argsKey);
    void (async () => {
      try {
        const all = await fetchAllPages<Row>((from, to) => supabase.rpc(fn, parsedArgs).range(from, to));
        if (isLatest()) setRows(all);
      } catch (rpcError) {
        if (isLatest()) setError(`Couldn't load the report: ${errorMessage(rpcError)}`);
      }
    })();
  }, [fn, argsKey, loadCount, startRequest]);

  const retry = useCallback(() => setLoadCount((count) => count + 1), []);
  return { rows, error, retry };
}

/** A [from, to) range as the report functions take it. */
export function rangeArgs(range: { from: Date; to: Date } | null): { p_from: string; p_to: string } | null {
  return range ? { p_from: range.from.toISOString(), p_to: range.to.toISOString() } : null;
}
