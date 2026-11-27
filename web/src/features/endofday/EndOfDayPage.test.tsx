// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));
let timeZone: string | null = 'America/Chicago';
vi.mock('../../lib/settings', () => ({
  useSettings: () => ({ settings: { time_zone: timeZone, shop_name: 'Ace Racquets' } }),
}));
let openSessions: { id: string; drawer_id: string; business_day: string }[] = [];
const report = vi.fn();
vi.mock('../../lib/drawers', async (original) => ({
  ...(await original<typeof import('../../lib/drawers')>()),
  fetchDrawers: vi.fn(async () => [{ id: 'd-1', name: 'Main drawer', is_active: true }]),
  fetchOpenSessions: vi.fn(async () => openSessions),
}));
vi.mock('../../lib/dayReport', async (original) => ({
  ...(await original<typeof import('../../lib/dayReport')>()),
  shopToday: () => '2026-11-27',
  fetchDayReport: (...args: unknown[]) => report(...args),
}));

const { EndOfDayPage } = await import('./EndOfDayPage');
const { DayReportPage } = await import('./DayReportPage');
const { sampleReport } = await import('./dayReportFixture');

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/end-of-day" element={<EndOfDayPage />} />
        <Route path="/end-of-day/:day/report" element={<DayReportPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  timeZone = 'America/Chicago';
  openSessions = [];
  report.mockResolvedValue(sampleReport);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EndOfDayPage', () => {
  it('lists drawers still open and links to today\'s X report', async () => {
    openSessions = [{ id: 's-1', drawer_id: 'd-1', business_day: '2026-11-26' }];
    renderAt('/end-of-day');
    expect(await screen.findByText('Today, Friday, November 27, 2026')).toBeTruthy();
    expect(screen.getByText('Main drawer (opened Thursday, November 26, 2026)')).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Print the day so far (X report)' }));
    expect(await screen.findByText('Day so far (X report)')).toBeTruthy();
    expect(report).toHaveBeenCalledWith('2026-11-27');
  });

  it('reports another day', async () => {
    renderAt('/end-of-day');
    expect(await screen.findByText('Every drawer is closed.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Day to report'), { target: { value: '2026-11-20' } });
    fireEvent.click(screen.getByRole('link', { name: 'Daily report' }));
    await screen.findByText('Day so far (X report)');
    expect(report).toHaveBeenCalledWith('2026-11-20');
  });

  it('needs the shop\'s time zone', () => {
    timeZone = null;
    renderAt('/end-of-day');
    expect(screen.getByText(/set the shop's time zone in Settings/)).toBeTruthy();
  });
});

describe('DayReportPage', () => {
  it('shows a load error and tries again', async () => {
    report.mockRejectedValueOnce(new Error("Couldn't load the daily report: offline"));
    renderAt('/end-of-day/2026-11-27/report');
    expect(await screen.findByText("Couldn't load the daily report: offline")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(await screen.findByText('Day so far (X report)')).toBeTruthy();
  });

  it('prints in the chosen layout', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderAt('/end-of-day/2026-11-27/report');
    await screen.findByText('Day so far (X report)');
    fireEvent.click(screen.getByRole('button', { name: 'Letter page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(print).toHaveBeenCalled();
    expect(localStorage.getItem('acestock.receiptLayout')).toBe('letter');
  });
});
