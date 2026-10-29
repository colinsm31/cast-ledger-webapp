import { useEffect, useRef } from 'react';

// Keeps track of the latest request a page has started, so an answer that
// arrives after a newer request (or after the page has closed) is thrown away
// instead of replacing what's on screen (code review #37).

export interface RequestTracker {
  /** Start a request; the returned check says whether it's still the latest. */
  start: () => () => boolean;
  /** Make every request started so far out of date. */
  cancel: () => void;
}

export function createRequestTracker(): RequestTracker {
  let latest = 0;
  return {
    start: () => {
      const id = ++latest;
      return () => id === latest;
    },
    cancel: () => {
      latest += 1;
    },
  };
}

/**
 * A page's request tracker; requests still running when the page closes are
 * out of date. Usage:
 *   const startRequest = useLatestRequest();
 *   const isLatest = startRequest();
 *   const { data } = await supabase…;
 *   if (!isLatest()) return;
 */
export function useLatestRequest(): () => () => boolean {
  const tracker = useRef<RequestTracker | null>(null);
  tracker.current ??= createRequestTracker();
  useEffect(() => {
    const current = tracker.current;
    return () => current?.cancel();
  }, []);
  return tracker.current.start;
}
