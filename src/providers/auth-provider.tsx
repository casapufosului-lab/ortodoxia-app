import type { Session, User } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { getInitialNativePasswordRecoverySession, subscribeToNativePasswordRecovery } from '@/lib/native-password-recovery';
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
  const startupResolvedRef = useRef(false);
  const pendingAuthEventRef = useRef<{ event: string; session: Session | null } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadInitialSession = async () => {
      const recoverySession = await getInitialNativePasswordRecoverySession();
      if (!isMounted) return;

      startupResolvedRef.current = true;

      if (recoverySession) {
        pendingAuthEventRef.current = null;
        setSession(recoverySession);
        setIsPasswordRecovery(true);
        setIsLoading(false);
        return;
      }

      const pendingAuthEvent = pendingAuthEventRef.current;
      pendingAuthEventRef.current = null;
      if (pendingAuthEvent) {
        setSession(pendingAuthEvent.session);
        setIsPasswordRecovery((current) => (
          pendingAuthEvent.event === 'PASSWORD_RECOVERY'
            ? true
            : pendingAuthEvent.event === 'SIGNED_OUT'
              ? false
              : current
        ));
        setIsLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (isMounted) {
        setSession(data.session);
        setIsLoading(false);
      }
    };

    void loadInitialSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!startupResolvedRef.current) {
        pendingAuthEventRef.current = { event, session: nextSession };
        return;
      }

      setSession(nextSession);
      setIsPasswordRecovery((current) => (
        event === 'PASSWORD_RECOVERY' ? true : event === 'SIGNED_OUT' ? false : current
      ));
      setIsLoading(false);
    });

    const unsubscribeRecovery = subscribeToNativePasswordRecovery((recoverySession) => {
      if (!isMounted) return;
      setSession(recoverySession);
      setIsPasswordRecovery(true);
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
      unsubscribeRecovery();
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
