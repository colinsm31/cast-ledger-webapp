import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { clearHeldSale } from '../lib/heldSale';

// 'pending' accounts are signed in but not yet approved; they have no access.
export type Role = 'admin' | 'staff' | 'pending';

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  role: Role | null;
  isAdmin: boolean;
  /** Approved to use the shop (staff or admin). */
  isStaff: boolean;
  /** Re-read the signed-in user's role, e.g. after a role change. */
  refreshRole: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    // Restore any stored session, then listen for changes.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id;

  // Load the signed-in user's role from their profile. Throws if it can't be
  // read, so callers choose what a failed load means.
  const loadRole = useCallback(async (): Promise<Role | null> => {
    if (!userId) return null;
    const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (error) throw error;
    // No readable profile means no access: fail closed.
    return (data as { role: Role } | null)?.role ?? 'pending';
  }, [userId]);

  // A failed refresh keeps the current role; the database still enforces it.
  const refreshRole = useCallback(async () => {
    try {
      setRole(await loadRole());
    } catch {
      // Keep the current role.
    }
  }, [loadRole]);

  useEffect(() => {
    let active = true;
    loadRole().then(
      (loaded) => {
        if (active) setRole(loaded);
      },
      // A failed first load means no access: fail closed.
      () => {
        if (active) setRole('pending');
      },
    );
    return () => {
      active = false;
    };
  }, [loadRole]);

  // A role changed elsewhere (another admin, another tab) is picked up when
  // the window regains focus.
  useEffect(() => {
    if (!userId) return;
    const onFocus = () => void refreshRole();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [userId, refreshRole]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      isAdmin: role === 'admin',
      isStaff: role === 'admin' || role === 'staff',
      refreshRole,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },
      signOut: async () => {
        const userId = session?.user?.id;
        await supabase.auth.signOut();
        // A ticket in progress isn't kept for whoever signs in next.
        if (userId) clearHeldSale(userId);
      },
    }),
    [loading, session, role, refreshRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
