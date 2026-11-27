// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

let settings: { time_zone: string | null } | null = null;
vi.mock('../../lib/settings', () => ({ useSettings: () => ({ settings }) }));

const { TimeZoneReminder } = await import('./TimeZoneReminder');
const { cashNeedsOpenDrawer } = await vi.importActual<typeof import('../../lib/settings')>('../../lib/settings');

afterEach(cleanup);

function renderReminder() {
  return render(
    <MemoryRouter>
      <TimeZoneReminder />
    </MemoryRouter>,
  );
}

describe('TimeZoneReminder', () => {
  it('asks for the time zone until it is set', () => {
    settings = { time_zone: null };
    renderReminder();
    expect(screen.getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe('/settings');
    cleanup();
    settings = { time_zone: 'America/Chicago' };
    renderReminder();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('says nothing while settings load', () => {
    settings = null;
    renderReminder();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('cashNeedsOpenDrawer', () => {
  it('needs both the setting and the time zone', () => {
    expect(cashNeedsOpenDrawer({ cash_needs_drawer: true, time_zone: 'UTC' })).toBe(true);
    expect(cashNeedsOpenDrawer({ cash_needs_drawer: true, time_zone: null })).toBe(false);
    expect(cashNeedsOpenDrawer({ cash_needs_drawer: false, time_zone: 'UTC' })).toBe(false);
    expect(cashNeedsOpenDrawer(null)).toBe(false);
  });
});
