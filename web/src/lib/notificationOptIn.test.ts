import { describe, expect, it } from 'vitest';
import { isValidEmail, optInChangeLabel, optInLabel, optInProblem, optInsToSave, phoneE164 } from './notificationOptIn';

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
  it('refuses unusable details', () => {
    expect(optInsToSave({ email_opt_in: true, sms_opt_in: false }, { email: 'nope', phone: '' })).toEqual({
      error: 'Add a valid email address to opt in to emails',
    });
    expect(optInsToSave({ email_opt_in: false, sms_opt_in: true }, { email: '', phone: '555' })).toEqual({
      error: 'Add a mobile number (10 digits) to opt in to texts',
    });
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
