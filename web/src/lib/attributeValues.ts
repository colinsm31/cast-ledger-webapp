// MARK: - Enum value rows
//
// The attribute edit form shows an enum's values as rows. A row that started
// as an existing value keeps that value as `original`, so editing it in place
// is a rename, which the server applies to products holding the old value.

export interface EnumValueRow {
  key: string;
  original: string | null;
  value: string;
}

export interface EnumValueChanges {
  values: string[];
  renames: Record<string, string>;
}

let nextRowKey = 0;

export function newEnumValueRow(original: string | null = null): EnumValueRow {
  nextRowKey += 1;
  return { key: `row-${nextRowKey}`, original, value: original ?? '' };
}

export function enumValueRowsFrom(values: string[]): EnumValueRow[] {
  return values.map((value) => newEnumValueRow(value));
}

/** The value list to save and the renames to apply. Blank rows are dropped. */
export function enumValueChanges(rows: EnumValueRow[]): EnumValueChanges {
  const values: string[] = [];
  const renames: Record<string, string> = {};
  for (const row of rows) {
    const value = row.value.trim();
    if (!value) continue;
    values.push(value);
    if (row.original !== null && row.original !== value) {
      renames[row.original] = value;
    }
  }
  return { values, renames };
}

/** A value listed twice, or null. */
export function duplicateEnumValue(values: string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

export function productsUpdatedNote(count: number): string {
  if (count === 0) return 'Saved';
  return `Saved · ${count} ${count === 1 ? 'product' : 'products'} updated`;
}
