// Turn an unknown thrown value into a user-facing message.
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message: unknown }).message);
    if (message.toLowerCase().includes('duplicate') || message.includes('23505')) {
      return 'That already exists (duplicate key).';
    }
    if (message.toLowerCase().includes('numeric field overflow')) {
      return 'That number is too large to save.';
    }
    return message || 'Something went wrong.';
  }
  return 'Something went wrong.';
}
