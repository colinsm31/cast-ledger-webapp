// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const main = { id: 'd-1', name: 'Main drawer', is_active: true };
const back = { id: 'd-2', name: 'Back counter', is_active: true };
let drawers = [main];
let openDrawerIds: string[] = [];
const fetchDrawers = vi.fn(async () => drawers);
vi.mock('../../lib/drawers', async (original) => ({
  ...(await original<typeof import('../../lib/drawers')>()),
  fetchDrawers: () => fetchDrawers(),
  fetchOpenSessions: vi.fn(async () => openDrawerIds.map((drawer_id) => ({ drawer_id }))),
}));

const { RegisterDrawerNotice } = await import('./RegisterDrawerNotice');

function renderNotice(cashNeedsDrawer = true) {
  return render(
    <MemoryRouter>
      <RegisterDrawerNotice cashNeedsDrawer={cashNeedsDrawer} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  drawers = [main];
  openDrawerIds = [];
});

describe('RegisterDrawerNotice', () => {
  it('says the drawer is closed, with a link to open it', async () => {
    renderNotice();
    expect(await screen.findByText(/cash drawer isn't open/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Go to the cash drawer' }).getAttribute('href')).toBe('/drawer');
  });

  it('asks for the register\'s drawer when several are open', async () => {
    drawers = [main, back];
    openDrawerIds = ['d-1', 'd-2'];
    renderNotice();
    expect(await screen.findByText(/Choose this register's drawer/)).toBeTruthy();
  });

  it('says nothing while the drawer is open', async () => {
    openDrawerIds = ['d-1'];
    renderNotice();
    await vi.waitFor(() => expect(fetchDrawers).toHaveBeenCalled());
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('checks nothing when the shop doesn\'t need a drawer for cash', () => {
    renderNotice(false);
    expect(fetchDrawers).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
