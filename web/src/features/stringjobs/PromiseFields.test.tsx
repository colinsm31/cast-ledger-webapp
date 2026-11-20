// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromiseFields, RushBadge } from './PromiseFields';

afterEach(cleanup);

describe('PromiseFields', () => {
  it('shows the promised time and rush, and reports changes', () => {
    const onPromised = vi.fn();
    const onRush = vi.fn();
    render(
      <PromiseFields promised="2026-11-21T10:00" rush={false} problem={null} onPromised={onPromised} onRush={onRush} />,
    );

    const promised = screen.getByLabelText('Promised by') as HTMLInputElement;
    expect(promised.value).toBe('2026-11-21T10:00');
    fireEvent.change(promised, { target: { value: '2026-11-21T15:30' } });
    expect(onPromised).toHaveBeenCalledWith('2026-11-21T15:30');

    fireEvent.click(screen.getByLabelText('Rush (top of the queue)'));
    expect(onRush).toHaveBeenCalledWith(true);
  });

  it('says what is wrong with the promised time', () => {
    render(
      <PromiseFields
        promised="2026-11-19T10:00"
        rush
        problem="The promised time has already passed."
        onPromised={vi.fn()}
        onRush={vi.fn()}
      />,
    );
    expect(screen.getByText('The promised time has already passed.')).toBeTruthy();
    expect((screen.getByLabelText('Rush (top of the queue)') as HTMLInputElement).checked).toBe(true);
  });
});

describe('RushBadge', () => {
  it('reads Rush', () => {
    render(<RushBadge />);
    expect(screen.getByText('Rush')).toBeTruthy();
  });
});
