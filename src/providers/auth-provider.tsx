import type { Session, User } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  isLoading: boolean;
  isPasswordRecovery: boolean;
  session: Session | null;
  user: User | null;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
        setIsLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setIsPasswordRecovery(event === 'PASSWORD_RECOVERY');
      setIsLoading(false);
    });

    const appStateListener = Platform.OS === 'web'
      ? null
      : AppState.addEventListener('change', (state) => {
          if (state === 'active') supabase.auth.startAutoRefresh();
          else supabase.auth.stopAutoRefresh();
        });

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      appStateListener?.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    isLoading,
    isPasswordRecovery,
    session,
    user: session?.user ?? null,
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  }), [isLoading, isPasswordRecovery, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth trebuie folosit în interiorul AuthProvider.');
  return context;
}
