// A report's columns: what each shows, how it's written on screen and in CSV,
// and how it adds up in the totals row.

import { csvMoney, toCsv, type CsvCell } from '../../lib/csv';
import { formatMoney, roundCents } from '../../lib/money';

export type ReportValueKind = 'text' | 'money' | 'count' | 'percent';
export type ReportValue = string | number | null;

export interface ReportColumn<Row> {
  label: string;
  kind: ReportValueKind;
  value: (row: Row) => ReportValue;
  /** The totals row: 'sum' adds the column; a function works it out; absent leaves it blank. */
  total?: 'sum' | ((rows: Row[]) => ReportValue);
}

/** A value as shown on screen: $ amounts, counts, one-decimal percents, "—" for nothing. */
export function formatReportValue(kind: ReportValueKind, value: ReportValue): string {
  if (value === null || value === '') return kind === 'text' ? '' : '—';
  if (kind === 'text') return String(value);
  const number = Number(value);
  if (kind === 'money') return formatMoney(number);
  if (kind === 'percent') return `${number.toFixed(1)}%`;
  return number.toLocaleString('en-US');
}

/** The totals row's values, one per column; null when no column has a total. */
export function reportTotals<Row>(columns: ReportColumn<Row>[], rows: Row[]): ReportValue[] | null {
  if (!columns.some((column) => column.total)) return null;
  return columns.map((column) => {
    if (column.total === 'sum') {
      const sum = rows.reduce((total, row) => total + Number(column.value(row) ?? 0), 0);
      return column.kind === 'money' ? roundCents(sum) : sum;
    }
    return column.total ? column.total(rows) : null;
  });
}

function csvValue(kind: ReportValueKind, value: ReportValue): CsvCell {
  if (value === null) return null;
  if (kind === 'text') return String(value);
  if (kind === 'money') return csvMoney(Number(value));
  return Number(value);
}

/** The report as CSV: a header row, the rows, and a Total row when there is one. */
export function reportCsv<Row>(columns: ReportColumn<Row>[], rows: Row[]): string {
  const body = rows.map((row) => columns.map((column) => csvValue(column.kind, column.value(row))));
  const totals = reportTotals(columns, rows);
  if (totals) {
    body.push(columns.map((column, index) => (index === 0 ? 'Total' : csvValue(column.kind, totals[index]))));
  }
  return toCsv(
    columns.map((column) => column.label),
    body,
  );
}

/** A margin % from margin and the sales it's on, to one decimal; null with no sales. */
export function marginPercent(margin: number, sales: number): number | null {
  return sales === 0 ? null : Math.round((1000 * margin) / sales) / 10;
}

/** Adds up one numeric field across rows (null counts as 0). */
export function sumOf<Row>(rows: Row[], value: (row: Row) => number | null): number {
  return rows.reduce((total, row) => total + Number(value(row) ?? 0), 0);
}
