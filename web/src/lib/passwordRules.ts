// Password rules shared by the Users page (temporary passwords) and My account
// (changing your own). The create-staff Edge Function and the project's auth
// settings enforce the same limits on the server.

export const MIN_PASSWORD_LENGTH = 8;
/** Supabase Auth ignores anything past 72 characters, so longer is refused. */
export const MAX_PASSWORD_LENGTH = 72;

/** What's wrong with a new password, or null if it's fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `Use a password of at most ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

/** What's wrong with a new password and its confirmation, or null if both are fine. */
export function newPasswordProblem(password: string, confirmation: string): string | null {
  return passwordProblem(password) ?? (password === confirmation ? null : "The new passwords don't match.");
}

/** The metadata create-staff sets on a new account, cleared when its owner changes the password. */
export const TEMPORARY_PASSWORD_FLAG = 'temporary_password';

/** Whether this account is still on the temporary password an admin gave it. */
export function usesTemporaryPassword(userMetadata: Record<string, unknown> | undefined): boolean {
  return userMetadata?.[TEMPORARY_PASSWORD_FLAG] === true;
}
