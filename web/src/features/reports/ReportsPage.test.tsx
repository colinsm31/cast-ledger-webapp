// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../app/BackContext', () => ({ useBack: () => {} }));
const { ReportsPage } = await import('./ReportsPage');

afterEach(cleanup);

describe('ReportsPage', () => {
  it('has a heading', () => {
    render(<ReportsPage />);
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeTruthy();
  });
});
