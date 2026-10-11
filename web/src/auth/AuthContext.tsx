import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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

  // Load the signed-in user's role from their profile.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setRole(null);
      return;
    }
    let active = true;
    void (async () => {
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
      // No readable profile means no access: fail closed.
      if (active) setRole((data as { role: Role } | null)?.role ?? 'pending');
    })();
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      role,
      isAdmin: role === 'admin',
      isStaff: role === 'admin' || role === 'staff',
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, role],
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
