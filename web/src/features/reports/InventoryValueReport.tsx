import { useMemo, useState } from 'react';
import type { ReportColumn } from './reportColumns';
import { ReportTable } from './ReportTable';
import { useReport } from './useReport';
import { inventoryByGroup, type InventoryGroupRow, type InventoryGrouping, type InventoryValueRow } from './inventoryValue';

// What the stock is worth now, at cost and at retail (report_inventory_value, 0097).

const PRODUCT_COLUMNS: ReportColumn<InventoryValueRow>[] = [
  { label: 'Product', kind: 'text', value: (row) => row.product },
  { label: 'Category', kind: 'text', value: (row) => row.category },
  { label: 'On hand', kind: 'count', value: (row) => Number(row.on_hand), total: 'sum' },
  { label: 'Cost each', kind: 'money', value: (row) => row.cost },
  { label: 'Value at cost', kind: 'money', value: (row) => row.value_at_cost, total: 'sum' },
  { label: 'Retail value', kind: 'money', value: (row) => row.retail_value, total: 'sum' },
  { label: 'Demo frames', kind: 'count', value: (row) => row.demo_frames, total: 'sum' },
  { label: 'Demo value at cost', kind: 'money', value: (row) => row.demo_value_at_cost, total: 'sum' },
];

function groupColumns(grouping: 'category' | 'brand'): ReportColumn<InventoryGroupRow>[] {
  return [
    { label: grouping === 'category' ? 'Category' : 'Brand', kind: 'text', value: (row) => row.name },
    { label: 'Products', kind: 'count', value: (row) => row.products, total: 'sum' },
    { label: 'On hand', kind: 'count', value: (row) => row.on_hand, total: 'sum' },
    { label: 'Value at cost', kind: 'money', value: (row) => row.value_at_cost, total: 'sum' },
    { label: 'Retail value', kind: 'money', value: (row) => row.retail_value, total: 'sum' },
    { label: 'Products without a cost', kind: 'count', value: (row) => row.without_cost, total: 'sum' },
    { label: 'Demo frames', kind: 'count', value: (row) => row.demo_frames, total: 'sum' },
    { label: 'Demo value at cost', kind: 'money', value: (row) => row.demo_value_at_cost, total: 'sum' },
  ];
}

const NOTE =
  'As of now. Value at cost uses each product’s current cost; products with no cost recorded have no value shown. Stock below zero (sold before it was received) is worth $0. Demo frames, in the rack or lent out, are counted apart from stock for sale.';

export function InventoryValueReport() {
  const [grouping, setGrouping] = useState<InventoryGrouping>('category');
  const report = useReport<InventoryValueRow>('report_inventory_value', {});
  const grouped = useMemo(
    () => (report.rows && grouping !== 'product' ? inventoryByGroup(report.rows, grouping) : null),
    [report.rows, grouping],
  );
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        By
        <select
          value={grouping}
          onChange={(e) => setGrouping(e.target.value as InventoryGrouping)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="category">Category</option>
          <option value="brand">Brand</option>
          <option value="product">Product</option>
        </select>
      </label>
      {grouping === 'product' ? (
        <ReportTable report={report} columns={PRODUCT_COLUMNS} csvName="inventory-value-by-product" emptyMessage="Nothing in stock." note={NOTE} />
      ) : (
        <ReportTable
          report={{ ...report, rows: grouped }}
          columns={groupColumns(grouping)}
          csvName={`inventory-value-by-${grouping}`}
          emptyMessage="Nothing in stock."
          note={NOTE}
        />
      )}
    </div>
  );
}
