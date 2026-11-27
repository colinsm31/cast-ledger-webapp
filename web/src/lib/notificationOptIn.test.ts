import { describe, expect, it } from 'vitest';
import {
  boxAfterContactEdit,
  contactChanged,
  isValidEmail,
  optInChangeLabel,
  optInLabel,
  optInProblem,
  optInsGivenAgain,
  optInsToSave,
  phoneE164,
} from './notificationOptIn';

describe('phoneE164 (matches the database)', () => {
  it.each([
    ['(415)555-0123', '+14155550123'],
    ['1 415 555 0123', '+14155550123'],
    ['+1 (415) 555-0123', '+14155550123'],
    ['+44 20 7946 0958', '+442079460958'],
    ['555-0123', null],
    ['(115)555-0123', null],
    ['415-555-0123 x12', null],
    ['', null],
    [null, null],
    ['+44 abc', null],
  ])('%s → %s', (input, expected) => {
    expect(phoneE164(input)).toBe(expected);
  });
});

describe('isValidEmail', () => {
  it('accepts an address with a domain ending', () => {
    expect(isValidEmail(' sam@example.com ')).toBe(true);
  });
  it('refuses others', () => {
    expect(isValidEmail('sam@example')).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });
});

describe('optInProblem', () => {
  it('names what is missing', () => {
    expect(optInProblem('email', 'x')).toMatch(/valid email/);
    expect(optInProblem('sms', '555')).toMatch(/mobile number/);
    expect(optInProblem('email', 'a@b.co')).toBeNull();
    expect(optInProblem('sms', '(415)555-0123')).toBeNull();
  });
});

describe('optInsToSave', () => {
  it('keeps ticked boxes with usable details', () => {
    expect(optInsToSave({ email_opt_in: true, sms_opt_in: true }, { email: 'a@b.co', phone: '(415)555-0123' })).toEqual({
      email_opt_in: true,
      sms_opt_in: true,
    });
  });
  it('turns a box off when its detail was cleared', () => {
    expect(optInsToSave({ email_opt_in: true, sms_opt_in: true }, { email: ' ', phone: '' })).toEqual({
      email_opt_in: false,
      sms_opt_in: false,
    });
  });
  it('saves a box off when its detail became unusable, so the customer can still be saved (#11)', () => {
    expect(optInsToSave({ email_opt_in: true, sms_opt_in: true }, { email: 'nope', phone: '555' })).toEqual({
      email_opt_in: false,
      sms_opt_in: false,
    });
  });
});

describe('contactChanged (as the database compares them)', () => {
  it('ignores case, spaces and phone formatting', () => {
    expect(contactChanged('email', 'Sam@Example.com', ' sam@example.com ')).toBe(false);
    expect(contactChanged('sms', '(415)555-0123', '415 555 0123')).toBe(false);
    expect(contactChanged('email', 'sam@example.com', 'sam2@example.com')).toBe(true);
    expect(contactChanged('sms', '(415)555-0123', '(415)555-0199')).toBe(true);
    expect(contactChanged('email', 'sam@example.com', '')).toBe(true);
    expect(contactChanged('email', null, '')).toBe(false);
  });
});

describe('optInsGivenAgain', () => {
  const saved = { email: 'sam@example.com', phone_number: '(415)555-0123', email_opt_in: true, sms_opt_in: true };
  it('names an opt-in given again for a new address', () => {
    expect(
      optInsGivenAgain(saved, { email: 'new@example.com', phone: '(415)555-0123' }, { email_opt_in: true, sms_opt_in: true }),
    ).toEqual({ email_opt_in: true });
    expect(
      optInsGivenAgain(saved, { email: 'new@example.com', phone: '(415)555-0199' }, { email_opt_in: true, sms_opt_in: true }),
    ).toEqual({ email_opt_in: true, sms_opt_in: true });
  });
  it('none when the address is the same, the box is off, or they had not opted in before', () => {
    expect(optInsGivenAgain(saved, { email: 'sam@example.com', phone: '(415)555-0123' }, { email_opt_in: true, sms_opt_in: true })).toBeNull();
    expect(optInsGivenAgain(saved, { email: 'new@example.com', phone: '' }, { email_opt_in: false, sms_opt_in: false })).toBeNull();
    expect(
      optInsGivenAgain({ ...saved, email_opt_in: false }, { email: 'new@example.com', phone: '(415)555-0123' },
        { email_opt_in: true, sms_opt_in: true }),
    ).toBeNull();
  });
});

describe('optInLabel', () => {
  it('lists the channels', () => {
    expect(optInLabel({ email_opt_in: true, sms_opt_in: true })).toBe('Ready messages: email and text');
    expect(optInLabel({ email_opt_in: false, sms_opt_in: true })).toBe('Ready messages: text');
    expect(optInLabel({ email_opt_in: false, sms_opt_in: false })).toBeNull();
  });
});

describe('optInChangeLabel', () => {
  it('says what changed', () => {
    expect(optInChangeLabel({ channel: 'sms', opted_in: true })).toBe('Opted in to texts');
    expect(optInChangeLabel({ channel: 'email', opted_in: false })).toBe('Opted out of emails');
  });
});

describe('boxAfterContactEdit', () => {
  it('unticks a box when its address becomes new, remembering the edit did it', () => {
    expect(boxAfterContactEdit({ ticked: true, untickedByEdit: false }, true)).toEqual({ ticked: false, untickedByEdit: true });
  });
  it('keeps it unticked while the address stays new', () => {
    expect(boxAfterContactEdit({ ticked: false, untickedByEdit: true }, true)).toEqual({ ticked: false, untickedByEdit: true });
  });
  it('ticks it again when the saved address is typed back', () => {
    expect(boxAfterContactEdit({ ticked: false, untickedByEdit: true }, false)).toEqual({ ticked: true, untickedByEdit: false });
  });
  it('leaves an opt-out staff chose alone', () => {
    expect(boxAfterContactEdit({ ticked: false, untickedByEdit: false }, true)).toEqual({ ticked: false, untickedByEdit: false });
    expect(boxAfterContactEdit({ ticked: false, untickedByEdit: false }, false)).toEqual({ ticked: false, untickedByEdit: false });
  });
});
