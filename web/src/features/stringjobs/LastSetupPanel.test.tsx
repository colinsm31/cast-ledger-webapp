// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LastSetupPanel, type LastSetup } from './LastSetupPanel';

afterEach(cleanup);

const job: LastSetup['job'] = {
  main_brand: 'Babolat',
  main_string: 'RPM Blast',
  main_specs: { gauge: '16' },
  main_tension: 55,
  main_customer_supplied: false,
  cross_brand: 'Babolat',
  cross_string: 'RPM Blast',
  cross_specs: { gauge: '16' },
  cross_tension: 55,
  cross_customer_supplied: false,
  entered_at: '2026-11-03T15:00:00Z',
};

describe('LastSetupPanel', () => {
  it('lists each past setup and fills the form from the one chosen', () => {
    const onUse = vi.fn();
    const other = { ...job, main_tension: 50, cross_tension: 50 };
    render(
      <LastSetupPanel
        setups={[
          { key: 'racket', label: 'Last time on this racquet', job },
          { key: 'customer', label: 'Last time on Head Speed MP', job: other },
        ]}
        onUse={onUse}
      />,
    );
    expect(screen.getByText(/Last time on this racquet/)).toBeTruthy();
    expect(screen.getByText('Babolat RPM Blast 16 @55')).toBeTruthy();
    expect(screen.getByText('Babolat RPM Blast 16 @50')).toBeTruthy();

    fireEvent.click(screen.getAllByText('Use this')[1]);
    expect(onUse).toHaveBeenCalledWith(other);
  });

  it('shows nothing for a first job', () => {
    const { container } = render(<LastSetupPanel setups={[]} onUse={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
