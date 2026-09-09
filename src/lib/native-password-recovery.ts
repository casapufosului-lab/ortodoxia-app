import type { Session } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

export const NATIVE_PASSWORD_RECOVERY_REDIRECT_URL = 'ortodoxia://auth';

function getUrlParam(url: string, name: string) {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const query =
    queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : '';
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';

  return new URLSearchParams(hash).get(name) ?? new URLSearchParams(query).get(name);
}

export async function consumeNativePasswordRecoveryUrl(url: string | null): Promise<Session | null> {
  if (Platform.OS === 'web' || !url) return null;
  if (getUrlParam(url, 'type') !== 'recovery') return null;

  const accessToken = getUrlParam(url, 'access_token');
  const refreshToken = getUrlParam(url, 'refresh_token');
  if (!accessToken || !refreshToken) return null;

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) return null;

  return data.session;
}

export async function getInitialNativePasswordRecoverySession(): Promise<Session | null> {
  return consumeNativePasswordRecoveryUrl(await Linking.getInitialURL());
}

export function subscribeToNativePasswordRecovery(onSession: (session: Session) => void) {
  if (Platform.OS === 'web') return () => undefined;

  const subscription = Linking.addEventListener('url', ({ url }) => {
    void consumeNativePasswordRecoveryUrl(url).then((session) => {
      if (session) onSession(session);
    });
  });

  return () => subscription.remove();
}
