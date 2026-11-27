import { supabase } from './supabase';

// PostgREST returns at most 1000 rows per request. When a screen needs every row
// of a table (e.g. to group products by brand client-side), page through with a
// stable, unique order key so no row is missed or duplicated across pages.
// `orderColumns` may list several columns (e.g. ['brand', 'id']); end with a
// unique one so rows that tie on the first never shift between pages.
export async function fetchAllRows<T>(
  table: string,
  columns: string,
  orderColumns: string | string[],
): Promise<T[]> {
  const orderBy = Array.isArray(orderColumns) ? orderColumns : [orderColumns];
  return fetchAllPages<T>((from, to) => {
    let request = supabase.from(table).select(columns);
    for (const column of orderBy) request = request.order(column, { ascending: true });
    return request.range(from, to);
  });
}

/** The most rows PostgREST returns for one request. */
export const PAGE_SIZE = 1000;

/**
 * Every row of a request that may return more than one page: `page(from, to)`
 * makes the request for rows from..to (inclusive), in a stable order. Throws
 * the first error.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return all;
  }
}

/**
 * `fetchAllRows` shaped like a single Supabase request ({ data, error }), for
 * screens that load several things side by side and check each one's error.
 */
export async function fetchAllRowsResult<T>(
  table: string,
  columns: string,
  orderColumns: string | string[],
): Promise<{ data: T[] | null; error: unknown }> {
  try {
    return { data: await fetchAllRows<T>(table, columns, orderColumns), error: null };
  } catch (error) {
    return { data: null, error };
  }
}
