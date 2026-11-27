// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Drawer, DrawerSession } from '../../lib/drawers';

vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));
let timeZone: string | null = 'America/Chicago';
vi.mock('../../lib/settings', () => ({ useSettings: () => ({ settings: { time_zone: timeZone } }) }));
const confirm = vi.fn(async () => true);
vi.mock('../../components/Dialog', () => ({ useDialog: () => ({ confirm }) }));

let drawers: Drawer[] = [];
let openSessions: DrawerSession[] = [];
const openDrawer = vi.fn(async () => 'session-1');
const closeDrawer = vi.fn(async () => {});
vi.mock('../../lib/drawers', async (original) => ({
  ...(await original<typeof import('../../lib/drawers')>()),
  fetchDrawers: vi.fn(async () => drawers),
  fetchOpenSessions: vi.fn(async () => openSessions),
  openDrawer: (...args: unknown[]) => openDrawer(...(args as [])),
  closeDrawer: (...args: unknown[]) => closeDrawer(...(args as [])),
}));

const { DrawerPage } = await import('./DrawerPage');

const main: Drawer = { id: 'd-main', name: 'Main drawer', is_active: true };
const back: Drawer = { id: 'd-back', name: 'Back counter', is_active: true };
const session: DrawerSession = {
  id: 's-1',
  drawer_id: 'd-main',
  business_day: '2026-11-27',
  opened_at: '2026-11-27T15:00:00Z',
  opened_by: 'u1',
  float_amount: 110,
  closed_at: null,
  counted_cash: null,
  close_note: null,
};

beforeEach(() => {
  localStorage.clear();
  drawers = [main];
  openSessions = [];
  timeZone = 'America/Chicago';
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DrawerPage', () => {
  it('opens the only drawer with a float counted by denomination', async () => {
    render(<DrawerPage />);
    expect(await screen.findByText('Main drawer')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('How many $20'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('How many $1'), { target: { value: '10' } });
    expect(screen.getByText('$110.00')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    await waitFor(() => expect(openDrawer).toHaveBeenCalledWith('d-main', { '20': 5, '1': 10 }));
  });

  it('says what is wrong with a count instead of sending it', async () => {
    render(<DrawerPage />);
    fireEvent.change(await screen.findByLabelText('How many $5'), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    expect(screen.getByText('$5: enter how many, as a whole number.')).toBeTruthy();
    expect(openDrawer).not.toHaveBeenCalled();
  });

  it('asks which drawer this register uses when there are several, and remembers it', async () => {
    drawers = [back, main];
    render(<DrawerPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Back counter' }));
    expect(screen.getByRole('heading', { name: 'Back counter' })).toBeTruthy();
    expect(localStorage.getItem('acestock.drawerId')).toBe('d-back');
    fireEvent.click(screen.getByRole('button', { name: 'Use another drawer' }));
    expect(screen.getByText('Which drawer is at this register?')).toBeTruthy();
  });

  it('closes an open drawer with a count and an optional note', async () => {
    openSessions = [session];
    render(<DrawerPage />);
    expect(await screen.findByText(/with a \$110\.00 float/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('How many $20'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Other cash'), { target: { value: '0.50' } });
    fireEvent.change(screen.getByLabelText('Note (optional)'), { target: { value: 'Short a roll' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close drawer' }));
    await waitFor(() => expect(closeDrawer).toHaveBeenCalledWith('s-1', { '20': 6, other: 0.5 }, 'Short a roll'));
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('Counted $120.50') }));
  });

  it('shows the server\'s refusal and the time zone reminder', async () => {
    timeZone = null;
    openDrawer.mockRejectedValueOnce(new Error('An admin needs to set the shop\'s time zone in Settings first'));
    render(<DrawerPage />);
    expect(await screen.findByText(/set the shop's time zone in Settings before drawers can be opened/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open drawer' }));
    expect(await screen.findByText('An admin needs to set the shop\'s time zone in Settings first')).toBeTruthy();
  });

  it('says when no drawer is in use', async () => {
    drawers = [{ ...main, is_active: false }];
    render(<DrawerPage />);
    expect(await screen.findByText(/No drawers are in use/)).toBeTruthy();
  });
});
