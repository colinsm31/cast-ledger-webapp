import { describe, expect, it } from 'vitest';
import { formatReportValue, marginPercent, reportCsv, reportTotals, sumOf, type ReportColumn } from './reportColumns';

interface Row { name: string; qty: number; amount: number | null }
const columns: ReportColumn<Row>[] = [
  { label: 'Name', kind: 'text', value: (row) => row.name },
  { label: 'Qty', kind: 'count', value: (row) => row.qty, total: 'sum' },
  { label: 'Amount', kind: 'money', value: (row) => row.amount, total: 'sum' },
  { label: 'Share', kind: 'percent', value: () => null, total: () => 100 },
];
const rows: Row[] = [
  { name: 'A', qty: 2, amount: 10.1 },
  { name: '=B', qty: 1, amount: null },
];

describe('formatReportValue', () => {
  it('writes money, counts and percents', () => {
    expect(formatReportValue('money', 1234.5)).toBe('$1,234.50');
    expect(formatReportValue('money', -3)).toBe('-$3.00');
    expect(formatReportValue('count', 1200)).toBe('1,200');
    expect(formatReportValue('percent', 60)).toBe('60.0%');
    expect(formatReportValue('text', 'x')).toBe('x');
  });
  it('shows a dash for nothing, except in text', () => {
    expect(formatReportValue('money', null)).toBe('—');
    expect(formatReportValue('text', null)).toBe('');
  });
});

describe('reportTotals', () => {
  it('adds up summed columns and works out the rest', () => {
    expect(reportTotals(columns, rows)).toEqual([null, 3, 10.1, 100]);
  });
  it('is null when nothing has a total', () => {
    expect(reportTotals([columns[0]], rows)).toBeNull();
  });
});

describe('reportCsv', () => {
  it('writes the rows and a Total row, amounts as numbers', () => {
    expect(reportCsv(columns, rows)).toBe('Name,Qty,Amount,Share\r\nA,2,10.1,\r\n\'=B,1,,\r\nTotal,3,10.1,100\r\n');
  });
  it('leaves the Total row out when nothing adds up', () => {
    expect(reportCsv([columns[0]], rows)).toBe('Name\r\nA\r\n\'=B\r\n');
  });
});

describe('marginPercent / sumOf', () => {
  it('works out a margin % to one decimal', () => {
    expect(marginPercent(12, 20)).toBe(60);
    expect(marginPercent(1, 3)).toBe(33.3);
    expect(marginPercent(5, 0)).toBeNull();
  });
  it('adds a field, counting nothing as 0', () => {
    expect(sumOf(rows, (row) => row.amount)).toBe(10.1);
  });
});
