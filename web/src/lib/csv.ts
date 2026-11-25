// CSV files for reports and lists: one format everywhere, read cleanly by
// Excel, Numbers, Google Sheets and QuickBooks.
//   - comma-separated, CRLF line ends, UTF-8 with a byte-order mark (so Excel
//     reads accents and "—" correctly);
//   - amounts as plain numbers with 2 decimals (no "$", no thousands commas);
//   - dates as YYYY-MM-DD;
//   - text that a spreadsheet would run as a formula (starting with =, +, -, @,
//     tab or return) is prefixed with ' so it shows as typed. Numbers are never
//     changed, so a negative amount stays a number.

export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell as CSV text: quoted when needed, formulas made safe. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A money amount for a CSV cell: 2 decimals, no "$". */
export function csvMoney(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

/** The whole file's text (without the byte-order mark). */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** A date as YYYY-MM-DD in the browser's time zone. */
export function localDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A moment as "YYYY-MM-DD HH:MM" in the browser's time zone; "" if it isn't one. */
export function localDateTimeString(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${localDateString(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A file name like "sales-by-brand_2026-11-01_to_2026-11-25.csv". `to` is
 * the end of a [from, to) range, so the last day named is the day before it
 * when it falls exactly on midnight.
 */
export function csvFileName(name: string, range?: { from: Date; to: Date }): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!range) return `${slug || 'export'}.csv`;
  const lastDay = new Date(range.to.getTime() - 1);
  const from = localDateString(range.from);
  const to = localDateString(lastDay < range.from ? range.from : lastDay);
  return `${slug || 'export'}_${from === to ? from : `${from}_to_${to}`}.csv`;
}

/** Hands the browser a CSV file to save. */
export function downloadCsv(fileName: string, csvText: string): void {
  const blob = new Blob(['﻿', csvText], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
