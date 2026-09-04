import { supabase } from './supabase';

// PostgREST returns at most 1000 rows per request. When a screen needs every row
// of a table (e.g. to group products by brand client-side), page through with a
// stable, unique order key so no row is missed or duplicated across pages.
export async function fetchAllRows<T>(
  table: string,
  columns: string,
  orderColumn: string,
): Promise<T[]> {
  const pageSize = 1000;
  let from = 0;
  const all: T[] = [];
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
