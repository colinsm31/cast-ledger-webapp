// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DayClose } from '../../lib/dayCloses';

vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));
let isAdmin = false;
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ isAdmin }) }));
const confirm = vi.fn(async () => true);
vi.mock('../../components/Dialog', () => ({ useDialog: () => ({ confirm }) }));
let timeZone: string | null = 'America/Chicago';
let settingsLoaded = true;
let settingsError: string | null = null;
const reloadSettings = vi.fn();
vi.mock('../../lib/settings', () => ({
  useSettings: () => ({
    settings: settingsLoaded ? { time_zone: timeZone, shop_name: 'Ace Racquets' } : null,
    error: settingsError,
    reload: reloadSettings,
  }),
}));
let openSessions: { id: string; drawer_id: string; business_day: string }[] = [];
vi.mock('../../lib/drawers', async (original) => ({
  ...(await original<typeof import('../../lib/drawers')>()),
  fetchDrawers: vi.fn(async () => [{ id: 'd-1', name: 'Main drawer', is_active: true }]),
  fetchOpenSessions: vi.fn(async () => openSessions),
}));
const report = vi.fn();
vi.mock('../../lib/dayReport', async (original) => ({
  ...(await original<typeof import('../../lib/dayReport')>()),
  shopToday: () => '2026-11-27',
  fetchDayReport: (...args: unknown[]) => report(...args),
}));
let closes: DayClose[] = [];
let unclosedDays: string[] = ['2026-11-27'];
const closeDay = vi.fn(async () => {});
const reopenDay = vi.fn(async () => {});
vi.mock('../../lib/dayCloses', async (original) => ({
  ...(await original<typeof import('../../lib/dayCloses')>()),
  fetchRecentCloses: vi.fn(async () => closes),
  fetchUnclosedDays: vi.fn(async () => unclosedDays),
  fetchPrintableDayReport: vi.fn(async (day: string) => {
    const close = closes.find((c) => c.business_day === day && !c.reopened_at) ?? null;
    return { close, report: close ? close.report : await report(day) };
  }),
  closeDay: (...args: unknown[]) => closeDay(...(args as [])),
  reopenDay: (...args: unknown[]) => reopenDay(...(args as [])),
}));

const { EndOfDayPage } = await import('./EndOfDayPage');
const { DayReportPage } = await import('./DayReportPage');
const { sampleReport } = await import('./dayReportFixture');

function closeOf(day: string, changes: Partial<DayClose> = {}): DayClose {
  return {
    id: `c-${day}`,
    business_day: day,
    closed_at: `${day}T23:30:00Z`,
    closed_by: 'pat',
    report: sampleReport,
    reopened_at: null,
    reopened_by: null,
    reopen_reason: null,
    ...changes,
  };
}

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
  settingsLoaded = true;
  settingsError = null;
  openSessions = [];
  closes = [];
  unclosedDays = ['2026-11-27'];
  isAdmin = false;
  report.mockResolvedValue(sampleReport);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EndOfDayPage', () => {
  it('lists drawers still open, links to the X report, and can\'t close the day yet', async () => {
    openSessions = [{ id: 's-1', drawer_id: 'd-1', business_day: '2026-11-26' }];
    renderAt('/end-of-day');
    expect(await screen.findByText('Today, Friday, November 27, 2026')).toBeTruthy();
    expect(screen.getByText('Main drawer (opened Thursday, November 26, 2026)')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Close the day' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('link', { name: 'Print the day so far (X report)' }));
    expect(await screen.findByText('Day so far (X report)')).toBeTruthy();
    expect(report).toHaveBeenCalledWith('2026-11-27');
  });

  it('closes the day once every drawer is closed, then offers the Z report', async () => {
    renderAt('/end-of-day');
    expect(await screen.findByText('Every drawer is closed.')).toBeTruthy();
    closeDay.mockImplementationOnce(async () => {
      closes = [closeOf('2026-11-27')];
    });
    fireEvent.click(screen.getByRole('button', { name: 'Close the day' }));
    await waitFor(() => expect(closeDay).toHaveBeenCalledWith('2026-11-27'));
    expect(await screen.findByText(/Closed .* by pat\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: 'Print the Z report' }));
    expect(await screen.findByText('Daily close (Z report)')).toBeTruthy();
    expect(report).not.toHaveBeenCalled();
  });

  it('closes an earlier day by its date, after midnight, leaving today open', async () => {
    unclosedDays = ['2026-11-26', '2026-11-27'];
    openSessions = [{ id: 's-1', drawer_id: 'd-1', business_day: '2026-11-27' }];
    renderAt('/end-of-day');
    expect(await screen.findByText('Earlier days not closed')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Close the day' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Close this day' }));
    await waitFor(() => expect(closeDay).toHaveBeenCalledWith('2026-11-26'));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Close Thursday, November 26, 2026?' }));
  });

  it('waits for a drawer opened on an earlier day before closing it', async () => {
    unclosedDays = ['2026-11-26', '2026-11-27'];
    openSessions = [{ id: 's-1', drawer_id: 'd-1', business_day: '2026-11-26' }];
    renderAt('/end-of-day');
    expect(await screen.findByText('close Main drawer first')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Close this day' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows why the close was refused', async () => {
    closeDay.mockRejectedValueOnce(new Error('Count and close every drawer first (still open: Back counter)'));
    renderAt('/end-of-day');
    fireEvent.click(await screen.findByRole('button', { name: 'Close the day' }));
    expect(await screen.findByText('Count and close every drawer first (still open: Back counter)')).toBeTruthy();
  });

  it('lets an admin reopen a past day, with an optional reason', async () => {
    isAdmin = true;
    closes = [closeOf('2026-11-26'), closeOf('2026-11-25', { reopened_at: '2026-11-26T15:00:00Z', reopened_by: 'admin', reopen_reason: 'Late sale' })];
    renderAt('/end-of-day');
    expect(await screen.findByText(/reopened .* by admin: Late sale/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Reopen' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(screen.getByText(/nothing new is added to a past day/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Forgot a refund' } });
    reopenDay.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: 'Reopen the day' }));
    expect(await screen.findByText('offline')).toBeTruthy();
    expect((screen.getByLabelText('Reason (optional)') as HTMLInputElement).value).toBe('Forgot a refund');
    fireEvent.click(screen.getByRole('button', { name: 'Reopen the day' }));
    await waitFor(() => expect(reopenDay).toHaveBeenLastCalledWith('2026-11-26', 'Forgot a refund'));
  });

  it('shows staff past closes without a Reopen button', async () => {
    closes = [closeOf('2026-11-26')];
    renderAt('/end-of-day');
    expect(await screen.findByRole('link', { name: 'Z report' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reopen' })).toBeNull();
  });

  it('reports another day', async () => {
    renderAt('/end-of-day');
    expect(await screen.findByText('Every drawer is closed.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Day to report'), { target: { value: '2026-11-20' } });
    fireEvent.click(screen.getByRole('link', { name: 'Daily report' }));
    await screen.findByText('Not closed (X report)');
    expect(report).toHaveBeenCalledWith('2026-11-20');
  });

  it('shows a Settings load error with Retry', async () => {
    settingsError = "Couldn't load the shop settings: offline";
    timeZone = null;
    settingsLoaded = false;
    renderAt('/end-of-day');
    expect(screen.getByText("Couldn't load the shop settings: offline")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(reloadSettings).toHaveBeenCalled();
  });

  it('needs the shop\'s time zone', () => {
    timeZone = null;
    renderAt('/end-of-day');
    expect(screen.getByText(/set the shop's time zone in Settings/)).toBeTruthy();
  });
});

describe('DayReportPage', () => {
  it('says when the address isn\'t a day', async () => {
    renderAt('/end-of-day/2026-13-40/report');
    expect(await screen.findByText(/"2026-13-40" isn't a day/)).toBeTruthy();
    expect(report).not.toHaveBeenCalled();
  });

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
