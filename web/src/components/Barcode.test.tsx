// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Barcode } from './Barcode';

afterEach(cleanup);

describe('Barcode', () => {
  it('draws the code as bars', () => {
    render(<Barcode text="U10001" />);
    expect(screen.getByRole('img', { name: 'Barcode U10001' }).querySelectorAll('rect').length).toBeGreaterThan(10);
  });

  it('shows a code Code 128 can\'t print as text instead', () => {
    render(<Barcode text="RQ-é1" />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('RQ-é1')).toBeTruthy();
  });
});
