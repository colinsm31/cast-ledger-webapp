import type { ReactNode } from 'react';
import { formatDateTimeShort } from '../../lib/dates';
import { formatBusinessDay, type DayReport } from '../../lib/dayReport';
import { overShortLabel } from '../../lib/drawers';
import { formatMoney } from '../../lib/money';
import type { ReceiptLayout } from '../../lib/receiptLayout';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Section({ title, thermal, children }: { title: string; thermal: boolean; children: ReactNode }) {
  return (
    <section className={thermal ? 'space-y-0.5 border-t border-dashed border-black pt-2' : 'space-y-1'}>
      <h2 className={thermal ? 'font-bold uppercase' : 'border-b border-slate-300 pb-1 text-base font-semibold'}>{title}</h2>
      {children}
    </section>
  );
}

// The daily report as printed: an X report (the day so far) or, once the day
// is closed, the Z report with who closed it. Thermal is one narrow column;
// letter is a page.
export function DayReportView({
  report,
  layout,
  shopName,
  closedBy,
  closedAt,
  isToday = true,
}: {
  report: DayReport;
  layout: ReceiptLayout;
  shopName: string | null;
  /** Set once the day is closed: this is then the Z report. */
  closedBy?: string | null;
  closedAt?: string | null;
  /** Whether the day is today (the day so far) or an earlier day left open. */
  isToday?: boolean;
}) {
  const thermal = layout === 'thermal';
  const closed = Boolean(closedAt);
  // Times are written in the shop's time zone, whatever the printing device's.
  const shopTime = (iso: string) => formatDateTimeShort(iso, report.time_zone);
  const title = closed ? 'Daily close (Z report)' : isToday ? 'Day so far (X report)' : 'Not closed (X report)';
  return (
    <article
      aria-label="Daily report"
      className={
        thermal
          ? 'mx-auto w-[72mm] space-y-2 bg-white font-mono text-[11px] leading-snug text-black'
          : 'mx-auto max-w-[7.3in] space-y-4 bg-white text-sm text-black'
      }
    >
      <header className={thermal ? 'text-center' : ''}>
        {shopName && <p className={thermal ? 'font-bold' : 'text-lg font-bold'}>{shopName}</p>}
        <h1 className={thermal ? 'font-bold' : 'text-2xl font-bold'}>{title}</h1>
        <p>{formatBusinessDay(report.day)}</p>
        {closed && closedAt && (
          <p>
            Closed {shopTime(closedAt)}
            {closedBy ? ` by ${closedBy}` : ''}
          </p>
        )}
        {!closed && <p>Printed {shopTime(new Date().toISOString())}; not closed yet</p>}
      </header>

      <Section title="Sales" thermal={thermal}>
        <Row label={`Tickets`} value={String(report.sales.count)} />
        <Row label="Items and stringing" value={formatMoney(report.sales.items)} />
        {report.sales.gift_cards !== 0 && <Row label="Gift cards sold" value={formatMoney(report.sales.gift_cards)} />}
        <Row label="Tax" value={formatMoney(report.sales.tax)} />
        <Row label="Sales total" value={formatMoney(report.sales.total)} strong />
      </Section>

      <Section title="Refunds" thermal={thermal}>
        <Row label="Refunds" value={String(report.refunds.count)} />
        <Row label="Items and stringing" value={formatMoney(report.refunds.items)} />
        {report.refunds.gift_cards !== 0 && <Row label="Gift card loads" value={formatMoney(report.refunds.gift_cards)} />}
        <Row label="Tax refunded" value={formatMoney(report.refunds.tax)} />
        <Row label="Refunds total" value={formatMoney(report.refunds.total)} strong />
      </Section>

      <Section title="Net" thermal={thermal}>
        <Row label="Items and stringing" value={formatMoney(report.net.items)} />
        <Row label="Tax" value={formatMoney(report.net.tax)} />
        <Row label="Net total" value={formatMoney(report.net.total)} strong />
        {report.exchanges.count > 0 && (
          <Row
            label={`Exchange credit (${report.exchanges.count})`}
            value={formatMoney(report.exchanges.credit)}
          />
        )}
      </Section>

      <Section title="By payment type" thermal={thermal}>
        {report.payments.length === 0 && <p>No payments.</p>}
        {report.payments.map((payment) => (
          <div key={payment.method}>
            <Row label={payment.label} value={formatMoney(payment.net)} strong />
            {payment.given_back !== 0 && (
              <p className="pl-2">
                taken {formatMoney(payment.taken)}, given back {formatMoney(payment.given_back)}
              </p>
            )}
          </div>
        ))}
      </Section>

      {report.categories.length > 0 && (
        <Section title="By category" thermal={thermal}>
          {report.categories.map((category) => (
            <Row key={category.name} label={category.name} value={formatMoney(category.net)} />
          ))}
        </Section>
      )}

      <Section title="Cash drawers" thermal={thermal}>
        {report.drawers.length === 0 && <p>No drawer was opened this day.</p>}
        {report.drawers.map((drawer) => (
          <div key={`${drawer.drawer}-${drawer.opened_at}`} className="space-y-0.5 pb-1">
            <p className="font-semibold">
              {drawer.drawer}
              {drawer.closed_at ? '' : ' (still open)'}
            </p>
            <Row label="Float" value={formatMoney(drawer.float)} />
            <Row label="Cash taken" value={formatMoney(drawer.cash_sales)} />
            <Row label="Cash given back" value={formatMoney(-drawer.cash_refunds)} />
            {drawer.paid_in !== 0 && <Row label="Paid in" value={formatMoney(drawer.paid_in)} />}
            {drawer.paid_out !== 0 && <Row label="Paid out" value={formatMoney(-drawer.paid_out)} />}
            <Row label="Expected" value={formatMoney(drawer.expected)} strong />
            {drawer.counted !== null && <Row label="Counted" value={formatMoney(drawer.counted)} />}
            {drawer.over_short !== null && <Row label="Over / short" value={overShortLabel(drawer.over_short)} strong />}
          </div>
        ))}
      </Section>
    </article>
  );
}
