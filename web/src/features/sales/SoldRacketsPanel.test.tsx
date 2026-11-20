// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

// A fake supabase: from().select().in().eq() for the customer's new racquets.
let result: { data: unknown; error: unknown } = { data: [], error: null };
const asked: unknown[] = [];
const query = {
  select: () => query,
  in: (_column: string, ids: unknown) => {
    asked.push(ids);
    return query;
  },
  eq: async () => result,
};
vi.mock('../../lib/supabase', () => ({ supabase: { from: () => query } }));

const { SoldRacketsPanel } = await import('./SoldRacketsPanel');

afterEach(cleanup);

function renderPanel(unitIds: string[]) {
  return render(
    <MemoryRouter>
      <SoldRacketsPanel unitIds={unitIds} />
    </MemoryRouter>,
  );
}

describe('SoldRacketsPanel', () => {
  it('offers to string a racquet just sold, or opens the job already started', async () => {
    result = {
      data: [
        { id: 'r1', customer_id: 'c1', brand: 'Head', model: 'Speed MP', barcode: 'RQ-1', string_jobs: [] },
        { id: 'r2', customer_id: 'c1', brand: null, model: 'Pure Drive', barcode: null,
          string_jobs: [{ id: 'j1', status: 'delivered' }, { id: 'j2', status: 'entered' }] },
      ],
      error: null,
    };
    renderPanel(['u1', 'u2']);
    await waitFor(() => expect(screen.getByText('String it now')).toBeTruthy());
    expect(asked.at(-1)).toEqual(['u1', 'u2']);
    expect(screen.getByText('String it now').getAttribute('href')).toBe('/customers/c1/rackets/r1/restring');
    expect(screen.getByText('Head Speed MP').parentElement?.textContent).toContain('tagged RQ-1');
    expect(screen.getByText('Open its string job').getAttribute('href')).toBe('/string-jobs/j2');
  });

  it('shows nothing when no racquet was sold to a customer', () => {
    const { container } = renderPanel([]);
    expect(container.innerHTML).toBe('');
  });

  it('says when the racquets can\'t be checked', async () => {
    result = { data: null, error: { message: 'offline' } };
    renderPanel(['u1']);
    await waitFor(() => expect(screen.getByText(/Couldn.t check the customer.s racquets: offline/)).toBeTruthy());
  });
});
