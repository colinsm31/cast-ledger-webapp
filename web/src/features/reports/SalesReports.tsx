import { useMemo, useState } from 'react';
import type { DateRange } from '../../lib/reportPeriod';
import { marginPercent, sumOf, type ReportColumn } from './reportColumns';
import { ReportTable } from './ReportTable';
import { rangeArgs, useReport } from './useReport';

// Sales by category / brand / product / staff, best-sellers and gross margin,
// all from report_sales_by (0095).

export type SalesGrouping = 'category' | 'brand' | 'product' | 'staff';

export interface SalesByRow {
  group_key: string;
  label: string;
  detail: string | null;
  tickets: number;
  qty_sold: number;
  sales: number;
  discounts: number;
  qty_returned: number;
  returns: number;
  net_qty: number;
  net_sales: number;
  costed_sales: number;
  cost: number;
  margin: number | null;
  margin_pct: number | null;
  uncosted_qty: number;
  cost_estimated: boolean;
}

const GROUPINGS: { value: SalesGrouping; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'brand', label: 'Brand' },
  { value: 'product', label: 'Product' },
  { value: 'staff', label: 'Staff member' },
];

function useSalesBy(range: DateRange | null, group: SalesGrouping) {
  const args = rangeArgs(range);
  return useReport<SalesByRow>('report_sales_by', args && { ...args, p_group: group });
}

function nameColumns(group: SalesGrouping): ReportColumn<SalesByRow>[] {
  const name: ReportColumn<SalesByRow> = {
    label: GROUPINGS.find((g) => g.value === group)?.label ?? 'Name',
    kind: 'text',
    value: (row) => row.label,
  };
  return group === 'product' ? [name, { label: 'Category', kind: 'text', value: (row) => row.detail }] : [name];
}

function GroupingPicker({ value, onChange }: { value: SalesGrouping; onChange: (group: SalesGrouping) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      By
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SalesGrouping)}
        className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
      >
        {GROUPINGS.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SalesReport({ range }: { range: DateRange | null }) {
  const [group, setGroup] = useState<SalesGrouping>('category');
  const report = useSalesBy(range, group);
  const columns: ReportColumn<SalesByRow>[] = [
    ...nameColumns(group),
    ...(group === 'staff' ? [{ label: 'Tickets', kind: 'count', value: (r: SalesByRow) => r.tickets, total: 'sum' } as const] : []),
    { label: 'Qty sold', kind: 'count', value: (row) => row.qty_sold, total: 'sum' },
    { label: 'Sales', kind: 'money', value: (row) => row.sales, total: 'sum' },
    { label: 'Discounts', kind: 'money', value: (row) => row.discounts, total: 'sum' },
    { label: 'Qty returned', kind: 'count', value: (row) => row.qty_returned, total: 'sum' },
    { label: 'Returns', kind: 'money', value: (row) => row.returns, total: 'sum' },
    { label: 'Net qty', kind: 'count', value: (row) => row.net_qty, total: 'sum' },
    { label: 'Net sales', kind: 'money', value: (row) => row.net_sales, total: 'sum' },
  ];
  return (
    <div className="space-y-3">
      <GroupingPicker value={group} onChange={setGroup} />
      <ReportTable
        report={report}
        columns={columns}
        csvName={`sales-by-${group}`}
        range={range}
        note="Sales are before tax and after discounts. Gift card loads count when the card is spent, so they aren't here. Returns count in the period they were made, against the original sale."
      />
    </div>
  );
}

export function MarginReport({ range }: { range: DateRange | null }) {
  const [group, setGroup] = useState<SalesGrouping>('category');
  const report = useSalesBy(range, group);
  const anyEstimated = report.rows?.some((row) => row.cost_estimated) ?? false;
  const columns: ReportColumn<SalesByRow>[] = [
    ...nameColumns(group),
    { label: 'Net qty', kind: 'count', value: (row) => row.net_qty, total: 'sum' },
    { label: 'Net sales', kind: 'money', value: (row) => row.net_sales, total: 'sum' },
    { label: 'Sales with a cost', kind: 'money', value: (row) => row.costed_sales, total: 'sum' },
    { label: 'Cost', kind: 'money', value: (row) => row.cost, total: 'sum' },
    { label: 'Margin', kind: 'money', value: (row) => row.margin, total: 'sum' },
    {
      label: 'Margin %',
      kind: 'percent',
      value: (row) => row.margin_pct,
      total: (rows) => marginPercent(sumOf(rows, (r) => r.margin), sumOf(rows, (r) => r.costed_sales)),
    },
    { label: 'Qty without a cost', kind: 'count', value: (row) => row.uncosted_qty, total: 'sum' },
    { label: 'Estimated cost', kind: 'text', value: (row) => (row.cost_estimated ? 'Yes' : '') },
  ];
  return (
    <div className="space-y-3">
      <GroupingPicker value={group} onChange={setGroup} />
      <ReportTable
        report={report}
        columns={columns}
        csvName={`gross-margin-by-${group}`}
        range={range}
        note={
          <>
            Margin is net sales less the cost recorded when each item sold, on items that have a cost. Items with no
            cost recorded (and stringing) are left out of margin.
            {anyEstimated &&
              ' "Estimated cost" marks rows with sales from before costs were kept with each sale; their cost is the product’s cost at that time, an estimate.'}
          </>
        }
      />
    </div>
  );
}

export function BestSellersReport({ range }: { range: DateRange | null }) {
  const report = useSalesBy(range, 'product');
  const ranked = useMemo(
    () =>
      report.rows
        ?.filter((row) => row.group_key !== 'stringing' && row.net_qty > 0)
        .sort((a, b) => b.net_qty - a.net_qty || b.net_sales - a.net_sales || a.label.localeCompare(b.label)) ?? null,
    [report.rows],
  );
  const columns: ReportColumn<SalesByRow>[] = [
    { label: 'Product', kind: 'text', value: (row) => row.label },
    { label: 'Category', kind: 'text', value: (row) => row.detail },
    { label: 'Net qty', kind: 'count', value: (row) => row.net_qty },
    { label: 'Net sales', kind: 'money', value: (row) => row.net_sales },
    { label: 'Margin %', kind: 'percent', value: (row) => row.margin_pct },
  ];
  return (
    <ReportTable
      report={report}
      rows={ranked}
      columns={columns}
      csvName="best-sellers"
      range={range}
      emptyMessage="No items sold in this period."
      note="Products ranked by how many sold, less returns."
    />
  );
}
