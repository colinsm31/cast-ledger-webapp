import { useMemo, useState } from 'react';
import { localDateTimeString } from '../../lib/csv';
import type { DateRange } from '../../lib/reportPeriod';
import type { ReportColumn } from './reportColumns';
import { ReportTable } from './ReportTable';
import { rangeArgs, useReport } from './useReport';
import { totalsByPerson, type PersonTotals, type PriceChangeKind, type PriceChangeRow } from './priceChanges';

// Discounts and price changes by who made or approved them (report_price_changes, 0096).

const KIND_LABEL: Record<PriceChangeKind, string> = {
  price_change: 'Price change',
  line_discount: 'Line discount',
  ticket_discount: 'Ticket discount',
};

const PERSON_COLUMNS: ReportColumn<PersonTotals>[] = [
  { label: 'Staff member', kind: 'text', value: (row) => row.person },
  { label: 'Price changes', kind: 'count', value: (row) => row.price_changes, total: 'sum' },
  { label: 'Price change total', kind: 'money', value: (row) => row.price_change_total, total: 'sum' },
  { label: 'Discounts given', kind: 'count', value: (row) => row.discounts, total: 'sum' },
  { label: 'Discount total', kind: 'money', value: (row) => row.discount_total, total: 'sum' },
  { label: 'Discounts approved', kind: 'count', value: (row) => row.approvals },
  { label: 'Approved total', kind: 'money', value: (row) => row.approved_total },
];

const DETAIL_COLUMNS: ReportColumn<PriceChangeRow>[] = [
  { label: 'Sold at', kind: 'text', value: (row) => localDateTimeString(row.sold_at) },
  { label: 'Type', kind: 'text', value: (row) => KIND_LABEL[row.kind] },
  { label: 'Item', kind: 'text', value: (row) => row.item },
  { label: 'Qty', kind: 'count', value: (row) => row.qty },
  { label: 'From', kind: 'money', value: (row) => row.from_price },
  { label: 'To', kind: 'money', value: (row) => row.to_price },
  { label: 'Taken off', kind: 'money', value: (row) => row.amount, total: 'sum' },
  { label: 'Made by', kind: 'text', value: (row) => row.made_by },
  { label: 'Approved by', kind: 'text', value: (row) => row.approved_by },
  { label: 'Reason', kind: 'text', value: (row) => row.reason },
  { label: 'Ticket ID', kind: 'text', value: (row) => row.sale_id },
];

export function PriceChangesReport({ range }: { range: DateRange | null }) {
  const [view, setView] = useState<'person' | 'detail'>('person');
  const report = useReport<PriceChangeRow>('report_price_changes', rangeArgs(range));
  const people = useMemo(() => (report.rows ? totalsByPerson(report.rows) : null), [report.rows]);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(['person', 'detail'] as const).map((option) => (
          <button
            key={option}
            onClick={() => setView(option)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              view === option ? 'bg-slate-800 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {option === 'person' ? 'By person' : 'Every change'}
          </button>
        ))}
      </div>
      {view === 'person' ? (
        <ReportTable
          report={{ ...report, rows: people }}
          columns={PERSON_COLUMNS}
          csvName="discounts-by-person"
          range={range}
          emptyMessage="No discounts or price changes in this period."
          note="Price changes and discounts count for the person who rang the sale; approvals for the admin who approved the ticket's discount. A negative price change total means prices were raised."
        />
      ) : (
        <ReportTable
          report={report}
          columns={DETAIL_COLUMNS}
          csvName="discounts-and-price-changes"
          range={range}
          emptyMessage="No discounts or price changes in this period."
          note='"(none)" means no reason was typed; reasons are optional.'
        />
      )}
    </div>
  );
}
