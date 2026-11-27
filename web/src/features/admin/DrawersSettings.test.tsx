// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let drawers = [{ id: 'd-1', name: 'Main drawer', is_active: true }];
const writes: { table: string; kind: string; values: unknown; id?: string }[] = [];
let writeError: { message: string } | null = null;
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      insert: async (values: unknown) => {
        writes.push({ table, kind: 'insert', values });
        return { error: writeError };
      },
      update: (values: unknown) => ({
        eq: async (_column: string, id: string) => {
          writes.push({ table, kind: 'update', values, id });
          return { error: writeError };
        },
      }),
    }),
  },
}));
vi.mock('../../lib/drawers', async (original) => ({
  ...(await original<typeof import('../../lib/drawers')>()),
  fetchDrawers: vi.fn(async () => drawers),
}));

const { DrawersSettings } = await import('./DrawersSettings');

afterEach(() => {
  cleanup();
  writes.length = 0;
  writeError = null;
});

describe('DrawersSettings', () => {
  it('adds a drawer, renames one and takes one out of use', async () => {
    render(<DrawersSettings />);
    const name = await screen.findByLabelText('Name of Main drawer');
    fireEvent.change(screen.getByLabelText('New drawer name'), { target: { value: '  Back counter ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add drawer' }));
    await waitFor(() => expect(writes).toContainEqual({ table: 'drawers', kind: 'insert', values: { name: 'Back counter' } }));

    fireEvent.change(name, { target: { value: 'Front register' } });
    fireEvent.blur(name);
    await waitFor(() => expect(writes).toContainEqual({ table: 'drawers', kind: 'update', values: { name: 'Front register' }, id: 'd-1' }));

    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(writes).toContainEqual({ table: 'drawers', kind: 'update', values: { is_active: false }, id: 'd-1' }));
  });

  it('asks for a name and shows a refused write', async () => {
    render(<DrawersSettings />);
    await screen.findByLabelText('Name of Main drawer');
    fireEvent.click(screen.getByRole('button', { name: 'Add drawer' }));
    expect(screen.getByText('Drawer name: enter a name, like "Front register".')).toBeTruthy();
    writeError = { message: 'duplicate key value violates unique constraint "uq_drawers_name"' };
    fireEvent.change(screen.getByLabelText('New drawer name'), { target: { value: 'main drawer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add drawer' }));
    expect(await screen.findByText(/uq_drawers_name|already/)).toBeTruthy();
  });
});
