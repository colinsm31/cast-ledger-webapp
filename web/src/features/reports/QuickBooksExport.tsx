import { useMemo } from 'react';
import { CsvButton } from '../../components/CsvButton';
import { LoadError } from '../../components/LoadError';
import { Spinner } from '../../components/Spinner';
import { csvFileName, downloadCsv } from '../../lib/csv';
import { browserTimeZone, type DateRange } from '../../lib/reportPeriod';
import { formatReportValue } from './reportColumns';
import { dayTotals, journalCsv, journalNumber, wholeDays, type JournalLine } from './quickbooks';
import { rangeArgs, useReport } from './useReport';

// The daily summary for QuickBooks: a balanced journal entry per day, to
// download and import (report_daily_summary, 0101).
export function QuickBooksExport({ range: chosen }: { range: DateRange | null }) {
  const range = wholeDays(chosen);
  const args = rangeArgs(range);
  const report = useReport<JournalLine>('report_daily_summary', args && { ...args, p_time_zone: browserTimeZone() });
  const totals = useMemo(() => (report.rows ? dayTotals(report.rows) : []), [report.rows]);
  const unbalanced = totals.filter((day) => day.debits !== day.credits);

  if (chosen && !range) {
    return <p className="text-sm text-slate-600">Today isn&rsquo;t over yet. Export it tomorrow, once the day is closed.</p>;
  }
  if (report.error) return <LoadError message={report.error} onRetry={report.retry} />;
  if (report.rows === null) return <Spinner label="Loading…" />;
  const lines = report.rows;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {totals.length === 0 ? 'No sales or refunds in this period.' : `${totals.length} day${totals.length === 1 ? '' : 's'}, one journal entry each.`}
        </p>
        <CsvButton
          disabled={lines.length === 0}
          onClick={() => range && downloadCsv(csvFileName('quickbooks-daily-summary', range), journalCsv(lines))}
        />
      </div>
      {unbalanced.length > 0 && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Debits and credits don&rsquo;t match on {unbalanced.map((day) => day.day).join(', ')}. Don&rsquo;t import those days; tell
          whoever looks after AceStock.
        </p>
      )}
      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Entry</th>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-left">Memo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-900">
              {lines.map((line) => (
                <tr key={`${line.day}-${line.line_no}`}>
                  <td className="px-3 py-2 text-slate-500">{line.line_no === 1 ? `${journalNumber(line.day)} · ${line.day}` : ''}</td>
                  <td className="px-3 py-2">{line.account}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.debit === null ? '' : formatReportValue('money', line.debit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.credit === null ? '' : formatReportValue('money', line.credit)}</td>
                  <td className="px-3 py-2 text-slate-600">{line.memo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-slate-500">
        Days are counted in this computer&rsquo;s time zone ({browserTimeZone()}), and only whole days are exported, up to the end of yesterday, so a day is never sent in part. Import the file in QuickBooks as journal
        entries, with dates as YYYY-MM-DD. Account names come from Settings. Gift card and store credit adjustments made
        outside a sale aren&rsquo;t included.
      </p>
    </div>
  );
}
