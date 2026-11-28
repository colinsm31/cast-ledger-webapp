// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DayReportView } from './DayReportView';
import { sampleReport } from './dayReportFixture';

afterEach(cleanup);

describe('DayReportView', () => {
  it('prints the day so far as an X report', () => {
    render(<DayReportView report={sampleReport} layout="thermal" shopName="Ace Racquets" />);
    expect(screen.getByText('Day so far (X report)')).toBeTruthy();
    expect(screen.getByText('Friday, November 27, 2026')).toBeTruthy();
    expect(screen.getByText('$111.60')).toBeTruthy(); // sales total
    expect(screen.getByText('$21.65', { selector: 'span' })).toBeTruthy();
    expect(screen.getByText('$89.95')).toBeTruthy(); // net total
    expect(screen.getByText('Exchange credit (1)')).toBeTruthy();
    expect(screen.getByText('taken $54.13, given back $21.65')).toBeTruthy();
    expect(screen.getByText('Short $0.15')).toBeTruthy();
    expect(screen.getByText('Paid out')).toBeTruthy();
    expect(screen.queryByText('Paid in')).toBeNull();
  });

  it('prints a closed day as the Z report with who closed it', () => {
    render(
      <DayReportView
        report={{ ...sampleReport, payments: [], drawers: [], categories: [] }}
        layout="letter"
        shopName={null}
        closedBy="Pat"
        closedAt="2026-11-28T00:00:00Z"
      />,
    );
    expect(screen.getByText('Daily close (Z report)')).toBeTruthy();
    expect(screen.getByText(/by Pat/)).toBeTruthy();
    expect(screen.getByText('No payments.')).toBeTruthy();
    expect(screen.getByText('No drawer was opened this day.')).toBeTruthy();
  });

  it('labels an earlier day left open, and writes times in the shop\'s time zone', () => {
    render(
      <DayReportView
        report={{ ...sampleReport, time_zone: 'UTC' }}
        layout="thermal"
        shopName={null}
        isToday={false}
      />,
    );
    expect(screen.getByText('Not closed (X report)')).toBeTruthy();
    cleanup();
    render(
      <DayReportView report={{ ...sampleReport, time_zone: 'UTC' }} layout="letter" shopName={null} closedAt="2026-11-28T03:00:00Z" />,
    );
    expect(screen.getByText(/Closed .*3:00/)).toBeTruthy();
  });

  it('marks a drawer still open', () => {
    const open = { ...sampleReport.drawers[0], closed_at: null, counted: null, over_short: null };
    render(<DayReportView report={{ ...sampleReport, drawers: [open] }} layout="thermal" shopName={null} />);
    expect(screen.getByText('Main drawer (still open)')).toBeTruthy();
    expect(screen.queryByText('Counted')).toBeNull();
  });
});
