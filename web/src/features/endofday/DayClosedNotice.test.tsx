// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fetchDayClose = vi.fn();
vi.mock('../../lib/dayCloses', () => ({ fetchDayClose: (...args: unknown[]) => fetchDayClose(...args) }));
vi.mock('../../lib/dayReport', () => ({ shopToday: () => '2026-11-27' }));

const { DayClosedNotice } = await import('./DayClosedNotice');

function renderNotice(timeZone: string | null) {
  return render(
    <MemoryRouter>
      <DayClosedNotice timeZone={timeZone} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DayClosedNotice', () => {
  it('says today is closed, with a link to End of Day', async () => {
    fetchDayClose.mockResolvedValue({ id: 'c1' });
    renderNotice('America/Chicago');
    expect(await screen.findByText(/Today has been closed/)).toBeTruthy();
    expect(fetchDayClose).toHaveBeenCalledWith('2026-11-27');
    expect(screen.getByRole('link', { name: 'End of Day screen' }).getAttribute('href')).toBe('/end-of-day');
  });

  it('says nothing while today is open, or when the check fails', async () => {
    fetchDayClose.mockResolvedValueOnce(null);
    renderNotice('America/Chicago');
    await vi.waitFor(() => expect(fetchDayClose).toHaveBeenCalled());
    expect(screen.queryByText(/Today has been closed/)).toBeNull();
    cleanup();
    fetchDayClose.mockRejectedValueOnce(new Error('offline'));
    renderNotice('America/Chicago');
    await vi.waitFor(() => expect(fetchDayClose).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Today has been closed/)).toBeNull();
  });

  it('checks nothing without the shop\'s time zone', () => {
    renderNotice(null);
    expect(fetchDayClose).not.toHaveBeenCalled();
  });
});
