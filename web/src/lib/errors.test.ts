import { describe, expect, it } from 'vitest';
import { errorMessage } from './errors';

describe('errorMessage', () => {
  it("uses the error's own message", () => {
    expect(errorMessage(new Error('Gift card balance 5 is less than 10'))).toBe('Gift card balance 5 is less than 10');
    expect(errorMessage({ message: 'Only admins can change settings' })).toBe('Only admins can change settings');
  });

  it('turns a duplicate-key error into plain words', () => {
    expect(errorMessage({ message: 'duplicate key value violates unique constraint "x"' })).toBe(
      'That already exists (duplicate key).',
    );
    expect(errorMessage({ message: 'error 23505' })).toBe('That already exists (duplicate key).');
  });

  it('turns a too-large number into plain words', () => {
    expect(errorMessage({ message: 'numeric field overflow' })).toBe('That number is too large to save.');
  });

  it('falls back when there is no message', () => {
    expect(errorMessage({ message: '' })).toBe('Something went wrong.');
    expect(errorMessage('a string')).toBe('Something went wrong.');
    expect(errorMessage(null)).toBe('Something went wrong.');
  });
});
