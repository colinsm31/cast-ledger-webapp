import { describe, expect, it } from 'vitest';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, newPasswordProblem, passwordProblem } from './passwordRules';

describe('passwordProblem', () => {
  it('allows 8 to 72 characters', () => {
    expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH))).toBeNull();
    expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH))).toBeNull();
  });

  it('refuses shorter or longer', () => {
    expect(passwordProblem('a'.repeat(MIN_PASSWORD_LENGTH - 1))).toBe('Use a password of at least 8 characters.');
    expect(passwordProblem('a'.repeat(MAX_PASSWORD_LENGTH + 1))).toBe('Use a password of at most 72 characters.');
  });
});

describe('newPasswordProblem', () => {
  it('needs the confirmation to match', () => {
    expect(newPasswordProblem('racquet-blue-42', 'racquet-blue-42')).toBeNull();
    expect(newPasswordProblem('racquet-blue-42', 'racquet-blue-43')).toBe("The new passwords don't match.");
  });

  it('reports the length first', () => {
    expect(newPasswordProblem('short', 'other')).toBe('Use a password of at least 8 characters.');
  });
});
