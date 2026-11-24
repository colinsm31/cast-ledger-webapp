// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadyTemplateFields } from './ReadyTemplateFields';

afterEach(cleanup);

describe('ReadyTemplateFields', () => {
  it('previews the messages with example values and the shop name', () => {
    render(
      <ReadyTemplateFields
        subject="Ready at {shop_name}"
        emailBody="Hi {first_name}"
        smsBody="Hi {first_name}, {racquet} is ready"
        shopName="Ace"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Ready at Ace')).toBeTruthy();
    expect(screen.getByText('Hi Sam')).toBeTruthy();
    expect(screen.getByText(/Hi Sam, Wilson Blade 98 is ready/)).toBeTruthy();
  });

  it('warns about a placeholder it won\'t fill and a long text', () => {
    render(
      <ReadyTemplateFields subject="x" emailBody="{firstname}" smsBody={'y'.repeat(200)} shopName="" onChange={vi.fn()} />,
    );
    expect(screen.getByText(/sent as typed: \{firstname\}/)).toBeTruthy();
    expect(screen.getByText(/sent as 2 texts/)).toBeTruthy();
  });

  it('reports edits', () => {
    const onChange = vi.fn();
    render(<ReadyTemplateFields subject="a" emailBody="b" smsBody="c" shopName="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Text message'), { target: { value: 'New' } });
    expect(onChange).toHaveBeenCalledWith({ readySmsBody: 'New' });
    fireEvent.change(screen.getByLabelText('Email subject'), { target: { value: 'S' } });
    expect(onChange).toHaveBeenCalledWith({ readyEmailSubject: 'S' });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'E' } });
    expect(onChange).toHaveBeenCalledWith({ readyEmailBody: 'E' });
  });
});
