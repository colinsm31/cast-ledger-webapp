import { CsvButton } from '../../components/CsvButton';
import { LoadError } from '../../components/LoadError';
import { csvFileName, downloadCsv, itemValueCsv } from '../../lib/csv';
import type { DateRange } from '../../lib/reportPeriod';
import { formatReportValue, type ReportColumn } from './reportColumns';
import { ReportTable } from './ReportTable';
import { rangeArgs, useReport } from './useReport';

// Stringing volume and revenue (report_stringing_summary, report_stringing; 0099).

export interface StringingSummary {
  jobs_entered: number;
  rush_entered: number;
  jobs_completed: number;
  jobs_delivered: number;
  jobs_cancelled: number;
  jobs_waiting: number;
  revenue: number;
  strings_revenue: number;
  labor_revenue: number;
  refunds: number;
  net_revenue: number;
}

export interface StringerRow {
  stringer: string;
  jobs_completed: number;
  rush: number;
  customer_supplied: number;
  on_time: number;
  late: number;
  avg_hours: number | null;
}

const STRINGER_COLUMNS: ReportColumn<StringerRow>[] = [
  { label: 'Stringer', kind: 'text', value: (row) => row.stringer },
  { label: 'Jobs completed', kind: 'count', value: (row) => row.jobs_completed, total: 'sum' },
  { label: 'Rush', kind: 'count', value: (row) => row.rush, total: 'sum' },
  { label: "Customer's own string", kind: 'count', value: (row) => row.customer_supplied, total: 'sum' },
  { label: 'On time', kind: 'count', value: (row) => row.on_time, total: 'sum' },
  { label: 'Late', kind: 'count', value: (row) => row.late, total: 'sum' },
  { label: 'Average hours', kind: 'count', value: (row) => (row.avg_hours === null ? null : Number(row.avg_hours)) },
];

const SUMMARY_TILES: { key: keyof StringingSummary; label: string; kind: 'count' | 'money' }[] = [
  { key: 'jobs_entered', label: 'Jobs taken in', kind: 'count' },
  { key: 'rush_entered', label: 'Of them rush', kind: 'count' },
  { key: 'jobs_completed', label: 'Jobs completed', kind: 'count' },
  { key: 'jobs_delivered', label: 'Jobs picked up', kind: 'count' },
  { key: 'jobs_cancelled', label: 'Jobs cancelled', kind: 'count' },
  { key: 'jobs_waiting', label: 'Waiting now', kind: 'count' },
  { key: 'revenue', label: 'Stringing charged', kind: 'money' },
  { key: 'strings_revenue', label: 'Net strings', kind: 'money' },
  { key: 'labor_revenue', label: 'Net labor', kind: 'money' },
  { key: 'refunds', label: 'Refunded', kind: 'money' },
  { key: 'net_revenue', label: 'Net stringing revenue', kind: 'money' },
];

/** The summary as a two-column CSV. */
function summaryCsv(totals: StringingSummary): string {
  return itemValueCsv(SUMMARY_TILES.map((tile) => ({ label: tile.label, value: Number(totals[tile.key]), money: tile.kind === 'money' })));
}

export function StringingReport({ range }: { range: DateRange | null }) {
  const args = rangeArgs(range);
  const summary = useReport<StringingSummary>('report_stringing_summary', args);
  const stringers = useReport<StringerRow>('report_stringing', args);
  const totals = summary.rows?.[0] ?? null;
  return (
    <div className="space-y-4">
      {summary.error && <LoadError message={summary.error} onRetry={summary.retry} />}
      {totals && range && (
        <div className="flex justify-end">
          <CsvButton onClick={() => downloadCsv(csvFileName('stringing-summary', range), summaryCsv(totals))} />
        </div>
      )}
      {totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SUMMARY_TILES.map((tile) => (
            <div key={tile.key} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-500">{tile.label}</p>
              <p className="text-lg font-bold tabular-nums text-slate-900">{formatReportValue(tile.kind, Number(totals[tile.key]))}</p>
            </div>
          ))}
        </div>
      )}
      <h2 className="text-sm font-semibold text-slate-700">Completed by stringer</h2>
      <ReportTable
        report={stringers}
        columns={STRINGER_COLUMNS}
        csvName="stringing-by-stringer"
        range={range}
        emptyMessage="No jobs completed in this period."
        note="Jobs taken in, completed, picked up and cancelled count by when each happened; waiting now is today. Strings are each charge's string price without the labor charge (never more than the charge; a customer's own string is labor only, a string change is strings); labor is the rest. Net strings and net labor take off refunds made in the period, each split the way its charge was."
      />
    </div>
  );
}
