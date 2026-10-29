import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Call a Supabase Edge Function as the signed-in user. On an error response,
 * throws an Error carrying the function's own `{ error }` message rather than
 * the client's generic "non-2xx status code".
 */
export async function invokeEdgeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const payload = (await error.context.json().catch(() => null)) as { error?: string } | null;
    if (payload?.error) throw new Error(payload.error);
  }
  throw error;
}
