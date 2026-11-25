// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotificationOptInFields } from './NotificationOptInFields';
import { OPT_IN_WORDING } from '../../lib/notificationOptIn';

afterEach(cleanup);

const box = (channel: 'email' | 'sms') => screen.getByLabelText(OPT_IN_WORDING[channel]) as HTMLInputElement;

describe('NotificationOptInFields', () => {
  it('ticks a box once its contact is usable', () => {
    const onChange = vi.fn();
    render(
      <NotificationOptInFields
        value={{ email_opt_in: false, sms_opt_in: false }}
        email="sam@example.com"
        phone="(415)555-0123"
        onChange={onChange}
      />,
    );
    fireEvent.click(box('sms'));
    expect(onChange).toHaveBeenCalledWith({ email_opt_in: false, sms_opt_in: true });
  });

  it('disables a box without a usable contact and says why', () => {
    render(
      <NotificationOptInFields
        value={{ email_opt_in: true, sms_opt_in: false }}
        email=""
        phone="555-01"
        onChange={vi.fn()}
      />,
    );
    expect(box('email').disabled).toBe(true);
    expect(box('email').checked).toBe(false);
    expect(box('sms').disabled).toBe(true);
    expect(screen.getByText('Add a mobile number (10 digits) to opt in to texts')).toBeTruthy();
    expect(screen.queryByText('Add a valid email address to opt in to emails')).toBeNull();
  });

  it('asks for consent again after the address changes', () => {
    render(
      <NotificationOptInFields
        value={{ email_opt_in: false, sms_opt_in: true }}
        email="new@example.com"
        phone="(415)555-0123"
        onChange={vi.fn()}
        askAgain={{ email: true }}
      />,
    );
    expect(screen.getByText('New email address: ask the customer again before ticking')).toBeTruthy();
    expect(screen.queryByText(/New mobile number/)).toBeNull();
  });
});
