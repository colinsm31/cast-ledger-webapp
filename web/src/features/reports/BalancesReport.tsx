import { useMemo, useState } from 'react';
import { localDateString, localDateTimeString } from '../../lib/csv';
import { endOfLocalDay } from '../../lib/reportPeriod';
import { formatReportValue, sumOf, type ReportColumn } from './reportColumns';
import { ReportTable } from './ReportTable';
import { useReport } from './useReport';

// Gift card and store credit liability at the end of a day (report_balances, 0098).

export interface BalanceRow {
  kind: 'gift_card' | 'store_credit';
  holder_id: string;
  code: string | null;
  customer: string | null;
  balance: number;
  last_activity: string | null;
  is_active: boolean;
}

const COLUMNS: ReportColumn<BalanceRow>[] = [
  { label: 'Type', kind: 'text', value: (row) => (row.kind === 'gift_card' ? 'Gift card' : 'Store credit') },
  { label: 'Gift card', kind: 'text', value: (row) => row.code },
  { label: 'Customer', kind: 'text', value: (row) => row.customer },
  { label: 'Balance', kind: 'money', value: (row) => row.balance, total: 'sum' },
  { label: 'Last activity', kind: 'text', value: (row) => localDateTimeString(row.last_activity) },
  { label: 'Active', kind: 'text', value: (row) => (row.is_active ? 'Yes' : 'No') },
];

export function BalancesReport() {
  const [day, setDay] = useState(() => localDateString(new Date()));
  const asOf = endOfLocalDay(day);
  const report = useReport<BalanceRow>('report_balances', asOf ? { p_as_of: asOf.toISOString() } : null);
  const totals = useMemo(() => {
    if (!report.rows) return null;
    return {
      giftCards: sumOf(report.rows.filter((row) => row.kind === 'gift_card'), (row) => row.balance),
      storeCredit: sumOf(report.rows.filter((row) => row.kind === 'store_credit'), (row) => row.balance),
    };
  }, [report.rows]);
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        At the end of
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
      </label>
      {!asOf && <p className="text-sm text-slate-500">Choose a day.</p>}
      {asOf && totals && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Total label="Gift card liability" value={totals.giftCards} />
          <Total label="Store credit owed" value={totals.storeCredit} />
        </div>
      )}
      {asOf && (
        <ReportTable
          report={report}
          columns={COLUMNS}
          csvName={`balances owed ${day}`}
          emptyMessage="Nothing owed on gift cards or store credit."
          note="Every gift card and customer with a balance at the end of that day, inactive ones included (they still hold value)."
        />
      )}
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-lg font-bold tabular-nums text-slate-900">{formatReportValue('money', value)}</p>
    </div>
  );
}
