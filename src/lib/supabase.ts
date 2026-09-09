import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Lipsesc variabilele publice Supabase din fișierul .env.');
}

const webStorage = {
  getItem: async (key: string) => typeof window === 'undefined' ? null : window.localStorage.getItem(key),
  setItem: async (key: string, value: string) => {
    if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (typeof window !== 'undefined') window.localStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});

export const chatGuestSupabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: Platform.OS === 'web' ? webStorage : AsyncStorage,
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
