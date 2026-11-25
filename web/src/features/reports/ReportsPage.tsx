import { useState, type ComponentType } from 'react';
import { useBack } from '../../app/BackContext';
import { LoadError } from '../../components/LoadError';
import { PeriodPicker } from '../../components/PeriodPicker';
import { TabButton } from '../../components/TabButton';
import { usePeriodRange, type DateRange } from '../../lib/reportPeriod';
import { useSettings } from '../../lib/settings';
import { BestSellersReport, MarginReport, SalesReport } from './SalesReports';
import { PriceChangesReport } from './PriceChangesReport';
import { InventoryValueReport } from './InventoryValueReport';
import { BalancesReport } from './BalancesReport';
import { StringingReport } from './StringingReport';

// The owner's reports (admin only): each one for a period, with a CSV download.

interface ReportTab {
  key: string;
  label: string;
  Report: ComponentType<{ range: DateRange | null }>;
  /** False for a report about now (or a chosen day), not a period. */
  usesPeriod?: boolean;
}

const REPORTS: ReportTab[] = [
  { key: 'sales', label: 'Sales', Report: SalesReport },
  { key: 'best-sellers', label: 'Best-sellers', Report: BestSellersReport },
  { key: 'margin', label: 'Gross margin', Report: MarginReport },
  { key: 'discounts', label: 'Discounts & price changes', Report: PriceChangesReport },
  { key: 'stringing', label: 'Stringing', Report: StringingReport },
  { key: 'inventory', label: 'Inventory value', Report: InventoryValueReport, usesPeriod: false },
  { key: 'balances', label: 'Gift card liability', Report: BalancesReport, usesPeriod: false },
];

export function ReportsPage() {
  useBack('/');
  const { settings, error: settingsError, reload: reloadSettings } = useSettings();
  const periodState = usePeriodRange(settings?.week_starts_monday ?? false, 'mtd');
  const [tabKey, setTabKey] = useState(REPORTS[0].key);
  const tab = REPORTS.find((report) => report.key === tabKey) ?? REPORTS[0];

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-slate-900">Reports</h1>
      {!settings && settingsError && <LoadError message={settingsError} onRetry={reloadSettings} />}
      <div className="flex flex-wrap gap-2 border-b border-slate-200">
        {REPORTS.map((report) => (
          <TabButton key={report.key} active={report.key === tab.key} onClick={() => setTabKey(report.key)}>
            {report.label}
          </TabButton>
        ))}
      </div>
      {tab.usesPeriod === false ? (
        <tab.Report key={tab.key} range={null} />
      ) : (
        <>
          <PeriodPicker state={periodState} />
          {periodState.range && <tab.Report key={tab.key} range={periodState.range} />}
        </>
      )}
    </div>
  );
}
