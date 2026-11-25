import type { DateRange } from '../../lib/reportPeriod';
import { marginPercent, sumOf, type ReportColumn } from './reportColumns';
import { ReportTable } from './ReportTable';
import { rangeArgs, useReport } from './useReport';

// Demo program activity by racquet model (report_demos, 0100).

export interface DemoRow {
  product_id: string;
  racquet: string;
  loans: number;
  led_to_sale: number;
  conversion_pct: number | null;
  returned: number;
  retired: number;
  avg_days_out: number | null;
  out_now: number;
  overdue_now: number;
}

const COLUMNS: ReportColumn<DemoRow>[] = [
  { label: 'Racquet', kind: 'text', value: (row) => row.racquet },
  { label: 'Demos lent', kind: 'count', value: (row) => row.loans, total: 'sum' },
  { label: 'Led to a sale', kind: 'count', value: (row) => row.led_to_sale, total: 'sum' },
  {
    label: 'Conversion %',
    kind: 'percent',
    value: (row) => row.conversion_pct,
    // The same ratio as a margin %: sales over loans.
    total: (rows) => marginPercent(sumOf(rows, (r) => r.led_to_sale), sumOf(rows, (r) => r.loans)),
  },
  { label: 'Returned', kind: 'count', value: (row) => row.returned, total: 'sum' },
  { label: 'Retired on return', kind: 'count', value: (row) => row.retired, total: 'sum' },
  { label: 'Average days out', kind: 'count', value: (row) => (row.avg_days_out === null ? null : Number(row.avg_days_out)) },
  { label: 'Out now', kind: 'count', value: (row) => row.out_now, total: 'sum' },
  { label: 'Overdue now', kind: 'count', value: (row) => row.overdue_now, total: 'sum' },
];

export function DemosReport({ range }: { range: DateRange | null }) {
  const report = useReport<DemoRow>('report_demos', rangeArgs(range));
  return (
    <ReportTable
      report={report}
      columns={COLUMNS}
      csvName="demo-program"
      range={range}
      emptyMessage="No demo activity in this period, and nothing out now."
      note="Demos lent and led to a sale count by when each demo went out (a sale counts when the borrower bought the same racquet within 30 days); returned and retired by when it came back. Out now and overdue now are as of this moment."
    />
  );
}
