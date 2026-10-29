import type { CatalogString, RowSel } from './stringJobForm';
import { NumberLimits, parseNumberField } from '../../lib/numberInput';

/**
 * What's still missing from one mains/crosses row before a job can be entered,
 * or null when the row is complete. A complete row names exactly one catalog
 * string (brand, string and every string attribute, e.g. color and gauge) and
 * has a tension, so the job knows which string to set aside and use up.
 */
export function rowProblem(catalog: CatalogString[], dims: string[], row: RowSel): string | null {
  if (!row.brand) return 'choose a brand';
  if (!row.name) return 'choose a string';

  const candidates = catalog.filter((c) => c.brand === row.brand && c.name === row.name);
  for (const dim of dims) {
    if (row.specs[dim]) continue;
    const consistent = candidates.filter((c) =>
      dims.every((other) => other === dim || !row.specs[other] || c.attributes[other] === row.specs[other]),
    );
    return consistent.some((c) => c.attributes[dim])
      ? `choose a ${dim}`
      : `${row.brand} ${row.name} has no ${dim} set in the catalog — add it on the product first`;
  }

  const matches = candidates.filter((c) => dims.every((dim) => c.attributes[dim] === row.specs[dim]));
  if (matches.length === 0) return 'that combination isn’t in the catalog';
  if (matches.length > 1) return 'more than one catalog string matches — check the catalog';

  const tension = parseNumberField(row.tension, 'Tension', 'decimal', { max: NumberLimits.maxTension });
  if ('error' in tension) {
    return Number(row.tension) > NumberLimits.maxTension
      ? `the tension is too high (the most is ${NumberLimits.maxTension.toLocaleString('en-US')})`
      : 'the tension must be a number, like 52 or 52.5';
  }
  if (!tension.value) return 'enter a tension';
  return null;
}

/** Both rows' problems, labelled for display ("Mains: choose a gauge"). */
export function jobRowProblems(
  catalog: CatalogString[],
  dims: string[],
  mains: RowSel,
  crosses: RowSel,
): string[] {
  const problems: string[] = [];
  const mainsProblem = rowProblem(catalog, dims, mains);
  if (mainsProblem) problems.push(`Mains: ${mainsProblem}`);
  const crossesProblem = rowProblem(catalog, dims, crosses);
  if (crossesProblem) problems.push(`Crosses: ${crossesProblem}`);
  return problems;
}
