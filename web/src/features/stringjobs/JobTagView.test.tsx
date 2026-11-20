// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { code128Bars } from '../../lib/code128';
import type { JobTag } from './jobTag';
import { JobTagView } from './JobTagView';

afterEach(cleanup);

const tag: JobTag = {
  code: 'J1042',
  customer: 'Pat Rally',
  phone: '(225) 555-0100',
  racket: 'Head Speed MP',
  racketTag: 'TAG-7',
  mains: 'Babolat RPM Blast 16 @55',
  crosses: 'Same as mains',
  promised: 'Sat, Nov 21, 5:00 PM',
  rush: true,
  paid: true,
  assignedTo: 'Alex',
  notes: 'extra knot',
};

describe('JobTagView', () => {
  it('prints the number, its barcode, and the job', () => {
    const { container } = render(<JobTagView tag={tag} />);
    expect(screen.getByText('J1042')).toBeTruthy();
    const barcode = screen.getByRole('img', { name: 'Barcode J1042' });
    // A white background plus one rectangle per bar.
    expect(barcode.querySelectorAll('rect')).toHaveLength(code128Bars('J1042').bars.length + 1);
    for (const text of ['RUSH', 'PAID', 'Pat Rally', 'Head Speed MP · TAG-7', 'Same as mains', 'Alex', 'extra knot']) {
      expect(container.textContent).toContain(text);
    }
    expect(container.textContent).toContain('Ready by Sat, Nov 21, 5:00 PM');
  });

  it('marks an unpaid job and leaves out what isn\'t set', () => {
    const { container } = render(
      <JobTagView tag={{ ...tag, rush: false, paid: false, phone: null, promised: null, assignedTo: null, notes: null }} />,
    );
    expect(container.textContent).toContain('UNPAID');
    expect(container.textContent).not.toContain('RUSH');
    expect(container.textContent).not.toContain('Ready by');
    expect(container.textContent).not.toContain('Stringer');
  });
});
