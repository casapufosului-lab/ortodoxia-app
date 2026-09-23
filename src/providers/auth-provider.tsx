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
  /**
   * Set when a native password-recovery deep link could not be consumed (the link
   * was expired, already used, or malformed). The auth screen renders a specific
   * message for it instead of silently showing the sign-in form.
   */
  recoveryLinkError: 'expired_or_invalid' | 'malformed_link' | null;
  clearRecoveryLinkError: () => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [recoveryLinkError, setRecoveryLinkError] = useState<'expired_or_invalid' | 'malformed_link' | null>(null);
  const startupResolvedRef = useRef(false);
  const pendingAuthEventRef = useRef<{ event: string; session: Session | null } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const applyRecoveryResult = (result: Awaited<ReturnType<typeof getInitialNativePasswordRecoverySession>>) => {
      if (result.status === 'ok') {
        setSession(result.session);
        // Only a genuine recovery link forces the password-reset screen. An e-mail
        // confirmation carries a valid session too, but the user must land signed in
        // on their normal destination — previously these links were a dead end
        // because the fragment's session was never consumed at all.
        setIsPasswordRecovery(result.linkType === 'recovery');
        setRecoveryLinkError(null);
        return true;
      }
      if (result.status === 'error') {
        // Do not fake success and do not stay silent: record why the link failed.
        setRecoveryLinkError(result.reason);
      }
      return false;
    };

    const loadInitialSession = async () => {
      try {
        const recovery = await getInitialNativePasswordRecoverySession();
        if (!isMounted) return;

        startupResolvedRef.current = true;

        if (applyRecoveryResult(recovery)) {
          pendingAuthEventRef.current = null;
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
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (isMounted) setSession(data.session);
      } finally {
        if (isMounted) setIsLoading(false);
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

    const unsubscribeRecovery = subscribeToNativePasswordRecovery((result) => {
      if (!isMounted) return;
      if (result.status === 'ok') {
        setSession(result.session);
        // Same distinction as at cold start: only a recovery link opens the reset form.
        setIsPasswordRecovery(result.linkType === 'recovery');
        setRecoveryLinkError(null);
      } else if (result.status === 'error') {
        setRecoveryLinkError(result.reason);
      }
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
    recoveryLinkError,
    clearRecoveryLinkError: () => setRecoveryLinkError(null),
    signOut: async () => {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },
  }), [isLoading, isPasswordRecovery, recoveryLinkError, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth trebuie folosit în interiorul AuthProvider.');
  return context;
}
