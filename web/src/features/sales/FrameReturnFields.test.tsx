// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FrameReturnFields } from './FrameReturnFields';

afterEach(cleanup);

describe('FrameReturnFields', () => {
  it('puts the frame back in stock by default, or retires it', () => {
    const onChange = vi.fn();
    render(<FrameReturnFields frame={{ status: 'in_stock', reason: '' }} problem={null} onChange={onChange} />);
    expect((screen.getByLabelText('Back in stock') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByLabelText('Why the frame is retired')).toBeNull();
    fireEvent.click(screen.getByLabelText('Damaged: retire it'));
    expect(onChange).toHaveBeenCalledWith({ status: 'retired', reason: '' });
  });

  it('asks why a retired frame is damaged', () => {
    const onChange = vi.fn();
    render(
      <FrameReturnFields
        frame={{ status: 'retired', reason: '' }}
        problem="Say why the returned frame is retired."
        onChange={onChange}
      />,
    );
    expect(screen.getByText('Say why the returned frame is retired.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Why the frame is retired'), { target: { value: 'Cracked' } });
    expect(onChange).toHaveBeenCalledWith({ status: 'retired', reason: 'Cracked' });
    fireEvent.click(screen.getByLabelText('Back in stock'));
    expect(onChange).toHaveBeenCalledWith({ status: 'in_stock', reason: '' });
  });
});
