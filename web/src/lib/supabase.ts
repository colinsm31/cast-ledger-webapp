import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Surfaced clearly in the console; the UI shows a setup screen too.
  console.error(
    'Missing Supabase config. Copy .env.example to .env.local and fill in ' +
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  );
}

export const isSupabaseConfigured = Boolean(url && anonKey);

// Exposed so an admin can create a staff login on a throwaway client without
// replacing their own session (see the Users screen).
export const supabaseUrl = url ?? 'https://placeholder.supabase.co';
export const supabaseAnonKey = anonKey ?? 'placeholder-anon-key';

// Falls back to placeholders when unconfigured so the module still imports;
// the app routes to a "setup needed" screen instead of crashing.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
);
