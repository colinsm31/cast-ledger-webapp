// How the screens write a moment in time, in the browser's own format and
// time zone, so every list reads the same.

/** e.g. "11/24/2026, 6:05:00 PM"; "—" for a value that isn't a date. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

/** e.g. "11/24/2026"; "—" for nothing or a value that isn't a date. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

/** e.g. "Nov 24, 2026, 6:05 PM", for logs; "—" for a value that isn't a date. */
export function formatDateTimeShort(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
