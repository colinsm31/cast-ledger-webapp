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
  const pageSize = 1000;
  const orderBy = Array.isArray(orderColumns) ? orderColumns : [orderColumns];
  let from = 0;
  const all: T[] = [];
  for (;;) {
    let request = supabase.from(table).select(columns);
    for (const column of orderBy) request = request.order(column, { ascending: true });
    const { data, error } = await request.range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
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
