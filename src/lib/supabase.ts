import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';

import { createChunkedSecureStorage } from '@/lib/secure-session-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Lipsesc variabilele publice Supabase din fișierul .env.');
}

type AuthStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const webStorage: AuthStorage = {
  getItem: async (key: string) => (typeof window === 'undefined' ? null : window.localStorage.getItem(key)),
  setItem: async (key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  },
};

/**
 * Storage used by both auth clients on native platforms.
 *
 * The chunked adapter keeps the session in the platform Keychain / Keystore and
 * never writes a credential to unencrypted storage. It also owns the one-time
 * migration of an existing AsyncStorage session, so upgrading users stay signed in
 * while the plaintext copy is removed. See src/lib/secure-session-storage.ts.
 */
const nativeStorage = createChunkedSecureStorage(
  SecureStore,
  AsyncStorage,
  () => {
    try {
      return typeof SecureStore.getItemAsync === 'function';
    } catch {
      // Accessing the module can throw on an unsupported platform.
      return false;
    }
  },
  (message, detail) => {
    if (__DEV__) console.warn(message, detail);
  },
);

/** Storage used by both clients: encrypted on device, localStorage on web. */
const authStorage: AuthStorage = Platform.OS === 'web' ? webStorage : nativeStorage;

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    // B8: the implicit flow delivered the session tokens inside the redirect URL, where
    // any app registered for the `ortodoxia` scheme could read them. The PKCE flow sends
    // a single-use code instead, which is exchanged for the session by the app itself.
    flowType: 'pkce',
  },
});

export const chatGuestSupabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: authStorage,
    storageKey: 'ortodoxia-chat-guest-auth',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function ensureGuestChatSession() {
  const { data: existing, error: sessionError } = await chatGuestSupabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (existing.session?.user.is_anonymous === true) return;
  if (existing.session) throw new Error('Sesiune guest chat invalidă.');

  const { data, error } = await chatGuestSupabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.session || data.user?.is_anonymous !== true) {
    throw new Error('Sesiunea anonimă pentru chat nu a putut fi creată.');
  }
}
