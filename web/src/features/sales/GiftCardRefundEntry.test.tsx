// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let finishLookup: (result: unknown) => void = () => {};
const maybeSingle = vi.fn(() => new Promise((resolve) => (finishLookup = resolve)));
vi.mock('../../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }), rpc: vi.fn() },
}));
vi.mock('../../components/Dialog', () => ({ useDialog: () => ({ confirm: vi.fn(async () => true) }) }));

const { GiftCardRefundEntry } = await import('./GiftCardRefundEntry');

afterEach(cleanup);

function renderEntry() {
  const onAdd = vi.fn();
  const onCancel = vi.fn();
  const onError = vi.fn();
  const view = render(
    <GiftCardRefundEntry defaultValue={10} customerId={null} onAdd={onAdd} onCancel={onCancel} onError={onError} />,
  );
  return { onAdd, onCancel, onError, view };
}

describe('GiftCardRefundEntry', () => {
  it('takes plain amounts only', () => {
    renderEntry();
    const amount = screen.getByPlaceholderText('0.00');
    for (const text of ['1e3', 'Infinity']) {
      fireEvent.change(amount, { target: { value: text } });
      expect(screen.getByText('Enter an amount like 12.50.')).toBeTruthy();
      expect((screen.getByRole('button', { name: 'Add $0.00' }) as HTMLButtonElement).disabled).toBe(true);
    }
    fireEvent.change(amount, { target: { value: '12.50' } });
    expect(screen.queryByText('Enter an amount like 12.50.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add $12.50' })).toBeTruthy();
  });

  it('can\'t be cancelled while a card is being looked up, and adds the card when found', async () => {
    const { onAdd, onCancel } = renderEntry();
    fireEvent.change(screen.getByPlaceholderText('Card code'), { target: { value: 'GC-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add $10.00' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);
    fireEvent.click(cancel);
    expect(onCancel).not.toHaveBeenCalled();
    finishLookup({ data: { gift_card_id: 'gc1', code: 'GC-1', is_active: true }, error: null });
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(10, 'gc1', 'GC-1'));
  });

  it('adds nothing when it closes before a lookup finishes', async () => {
    const { onAdd, view } = renderEntry();
    fireEvent.change(screen.getByPlaceholderText('Card code'), { target: { value: 'GC-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add $10.00' }));
    view.unmount();
    finishLookup({ data: { gift_card_id: 'gc1', code: 'GC-1', is_active: true }, error: null });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onAdd).not.toHaveBeenCalled();
  });
});
