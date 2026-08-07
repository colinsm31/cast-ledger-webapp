import { useMemo } from 'react';
import type { JsonValue } from '../../types/domain';

export const cellClass =
  'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

// A string product from the catalog. Each product is a unique item, so its own
// attributes (gauge, color, …) fully describe the string.
export interface CatalogString {
  id: string;
  brand: string;
  name: string;
  attributes: Record<string, string>;
  sellPrice: number | null;
}

export interface StringProductRaw {
  id: string;
  brand: string | null;
  name: string;
  attributes: Record<string, JsonValue> | null;
  sell_price: number | null;
  categories: { name: string } | null;
}

export interface AttributeDefRaw {
  name: string;
  sort_order: number;
  categories: { name: string } | null;
}

// One row's selection (mains or crosses). brand → name → per-attribute specs
// cascade down to a single string product.
export interface RowSel {
  brand: string;
  name: string;
  specs: Record<string, string>;
  tension: string;
}

export const emptyRow: RowSel = { brand: '', name: '', specs: {}, tension: '' };

// Preferred column order for string attributes (color before gauge); any other
// attributes keep their category sort order after these.
const PREFERRED_DIM_ORDER = ['color', 'gauge'];
export function orderDims(names: string[]): string[] {
  const rank = (n: string) => {
    const i = PREFERRED_DIM_ORDER.indexOf(n.toLowerCase());
    return i === -1 ? PREFERRED_DIM_ORDER.length : i;
  };
  return [...names].sort((a, b) => rank(a) - rank(b));
}

// Map raw string products from the catalog to CatalogString (string attributes).
export function toCatalogStrings(raw: StringProductRaw[]): CatalogString[] {
  return raw
    .filter((p) => p.categories?.name === 'Strings')
    .map((p) => {
      const attributes: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.attributes ?? {})) {
        if (v != null && v !== '') attributes[k] = String(v);
      }
      return { id: p.id, brand: p.brand ?? '', name: p.name, attributes, sellPrice: p.sell_price ?? null };
    });
}

// Strings variant attribute names, color-first.
export function stringDims(raw: AttributeDefRaw[]): string[] {
  return orderDims(raw.filter((a) => a.categories?.name === 'Strings').map((a) => a.name));
}

// Build a form row from one side (mains/crosses) of a stored job.
export function jobSideToRow(
  brand: string | null,
  name: string | null,
  specs: Record<string, unknown> | null,
  tension: number | null,
): RowSel {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(specs ?? {})) {
    if (v != null && v !== '') out[k] = String(v);
  }
  return {
    brand: brand ?? '',
    name: name ?? '',
    specs: out,
    tension: tension != null ? String(tension) : '',
  };
}

// The specific string product a row resolves to, when brand + name + every
// attribute value match exactly one catalog product.
export function resolveProduct(
  catalog: CatalogString[],
  dims: string[],
  row: RowSel,
): CatalogString | undefined {
  return catalog.find(
    (c) =>
      c.brand === row.brand &&
      c.name === row.name &&
      dims.every((d) => (row.specs[d] || '') === (c.attributes[d] || '')),
  );
}

// Build the DB columns for one side of a job.
export function rowPayload(
  catalog: CatalogString[],
  dims: string[],
  row: RowSel,
  prefix: 'main' | 'cross',
): Record<string, unknown> {
  if (!row.name) {
    return {
      [`${prefix}_product_id`]: null,
      [`${prefix}_brand`]: null,
      [`${prefix}_string`]: null,
      [`${prefix}_specs`]: {},
      [`${prefix}_tension`]: row.tension ? Number(row.tension) : null,
    };
  }
  const product = resolveProduct(catalog, dims, row);
  return {
    [`${prefix}_product_id`]: product?.id ?? null,
    [`${prefix}_brand`]: row.brand || null,
    [`${prefix}_string`]: row.name,
    [`${prefix}_specs`]: product ? product.attributes : row.specs,
    [`${prefix}_tension`]: row.tension ? Number(row.tension) : null,
  };
}

// The mains/crosses table, shared by the entry and detail screens. When
// `readOnly`, values render as plain text instead of dropdowns.
export function StringJobTable({
  dims,
  brands,
  catalog,
  mains,
  crosses,
  onMains,
  onCrosses,
  readOnly = false,
}: {
  dims: string[];
  brands: string[];
  catalog: CatalogString[];
  mains: RowSel;
  crosses: RowSel;
  onMains?: (patch: Partial<RowSel>) => void;
  onCrosses?: (patch: Partial<RowSel>) => void;
  readOnly?: boolean;
}) {
  return (
    <table className="w-full border-separate border-spacing-x-2 border-spacing-y-2 text-sm">
      <thead>
        <tr className="text-left text-xs font-semibold uppercase text-slate-500">
          <th></th>
          <th>Brand</th>
          <th>String</th>
          {dims.map((d) => (
            <th key={d} className="capitalize">
              {d}
            </th>
          ))}
          <th>Tension</th>
        </tr>
      </thead>
      <tbody>
        <StringRowInputs label="Mains" row={mains} onChange={onMains} brands={brands} catalog={catalog} dims={dims} readOnly={readOnly} />
        <StringRowInputs label="Crosses" row={crosses} onChange={onCrosses} brands={brands} catalog={catalog} dims={dims} readOnly={readOnly} />
      </tbody>
    </table>
  );
}

function StringRowInputs({
  label,
  row,
  onChange,
  brands,
  catalog,
  dims,
  readOnly,
}: {
  label: string;
  row: RowSel;
  onChange?: (patch: Partial<RowSel>) => void;
  brands: string[];
  catalog: CatalogString[];
  dims: string[];
  readOnly: boolean;
}) {
  // Distinct string names for the chosen brand.
  const names = useMemo(
    () =>
      Array.from(new Set(catalog.filter((c) => c.brand === row.brand).map((c) => c.name))).sort((a, b) =>
        a.localeCompare(b),
      ),
    [catalog, row.brand],
  );

  // Products sharing the chosen brand + name (each is one attribute combination).
  const matches = useMemo(
    () => catalog.filter((c) => c.brand === row.brand && c.name === row.name),
    [catalog, row.brand, row.name],
  );

  // Options for one attribute dropdown: distinct values among the brand+name
  // products, narrowed by whatever other attributes are already picked.
  function optionsForDim(dim: string): string[] {
    const opts = new Set<string>();
    for (const p of matches) {
      const consistent = dims.every(
        (other) => other === dim || !row.specs[other] || (p.attributes[other] || '') === row.specs[other],
      );
      if (consistent && p.attributes[dim]) opts.add(p.attributes[dim]);
    }
    return Array.from(opts).sort((a, b) => a.localeCompare(b));
  }

  if (readOnly) {
    return (
      <tr>
        <td className="pr-2 text-sm font-semibold text-slate-700">{label}</td>
        <td className="text-sm text-slate-800">{row.brand || '—'}</td>
        <td className="text-sm text-slate-800">{row.name || '—'}</td>
        {dims.map((d) => (
          <td key={d} className="text-sm text-slate-600">
            {row.specs[d] || '—'}
          </td>
        ))}
        <td className="text-sm text-slate-800">{row.tension || '—'}</td>
      </tr>
    );
  }

  const change = onChange ?? (() => {});

  return (
    <tr>
      <td className="pr-2 text-sm font-semibold text-slate-700">{label}</td>
      <td>
        <select
          value={row.brand}
          onChange={(e) => change({ brand: e.target.value, name: '', specs: {} })}
          className={`${cellClass} min-w-[8rem]`}
        >
          <option value="">—</option>
          {brands.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select
          value={row.name}
          onChange={(e) => change({ name: e.target.value, specs: {} })}
          disabled={!row.brand}
          className={`${cellClass} min-w-[10rem] disabled:opacity-50`}
        >
          <option value="">—</option>
          {names.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </td>
      {dims.map((d) => {
        const opts = optionsForDim(d);
        return (
          <td key={d}>
            <select
              value={row.specs[d] ?? ''}
              onChange={(e) => change({ specs: { ...row.specs, [d]: e.target.value } })}
              disabled={!row.name || opts.length === 0}
              className={`${cellClass} min-w-[6rem] disabled:opacity-50`}
            >
              <option value="">—</option>
              {opts.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </td>
        );
      })}
      <td>
        <input
          value={row.tension}
          onChange={(e) => change({ tension: e.target.value })}
          inputMode="decimal"
          placeholder="lb"
          className={`${cellClass} w-20`}
        />
      </td>
    </tr>
  );
}
