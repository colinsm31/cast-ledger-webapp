import type { ReactNode } from 'react';
import { CsvButton } from '../../components/CsvButton';
import { LoadError } from '../../components/LoadError';
import { Spinner } from '../../components/Spinner';
import { csvFileName, downloadCsv } from '../../lib/csv';
import { formatReportValue, reportCsv, reportTotals, type ReportColumn } from './reportColumns';
import type { ReportState } from './useReport';

// A report as a table, with a totals row and a CSV download of the same.
export function ReportTable<Row>({
  report,
  columns,
  csvName,
  range,
  rows: shownRows,
  emptyMessage = 'Nothing in this period.',
  note,
}: {
  report: ReportState<Row>;
  columns: ReportColumn<Row>[];
  csvName: string;
  range?: { from: Date; to: Date } | null;
  /** The rows to show, when not the report's own (e.g. sorted or filtered). */
  rows?: Row[] | null;
  emptyMessage?: string;
  note?: ReactNode;
}) {
  const rows = shownRows ?? report.rows;
  if (report.error) return <LoadError message={report.error} onRetry={report.retry} />;
  if (rows === null) return <Spinner label="Loading…" />;
  const totals = reportTotals(columns, rows);
  const alignment = (kind: string) => (kind === 'text' ? 'text-left' : 'text-right tabular-nums');
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <CsvButton
          disabled={rows.length === 0}
          onClick={() => downloadCsv(csvFileName(csvName, range ?? undefined), reportCsv(columns, rows))}
        />
      </div>
      {rows.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column.label} className={`px-3 py-2 ${alignment(column.kind)}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-900">
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((column) => (
                    <td key={column.label} className={`px-3 py-2 ${alignment(column.kind)}`}>
                      {formatReportValue(column.kind, column.value(row))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totals && (
              <tfoot className="border-t-2 border-slate-200 font-semibold text-slate-900">
                <tr>
                  {columns.map((column, index) => (
                    <td key={column.label} className={`px-3 py-2 ${alignment(column.kind)}`}>
                      {index === 0 ? 'Total' : formatReportValue(column.kind, totals[index])}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}
