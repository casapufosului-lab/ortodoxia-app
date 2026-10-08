import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';

import { parseAuthLink, resolveLinkType, type SupportedLinkType } from '@/lib/auth-link';
import { supabase } from '@/lib/supabase';

/**
 * A single redirect target for every native auth e-mail.
 *
 * Supabase appends the PKCE code to it, so one registered scheme handler can serve
 * password recovery AND e-mail confirmation. The link parsing lives in
 * `src/lib/auth-link.ts`, together with the reason a code is preferred over the
 * implicit flow's session tokens.
 */
export const NATIVE_PASSWORD_RECOVERY_REDIRECT_URL = 'ortodoxia://auth';

/**
 * Set when the user asks for the reset e-mail on this device. An exchanged code does
 * not say why it was issued, so this marker is what tells a recovery link apart from a
 * plain confirmation and opens the reset form instead of the ordinary destination.
 */
const PENDING_RECOVERY_STORAGE_KEY = 'ortodoxia.auth.pending-password-recovery';

async function hasPendingPasswordRecoveryRequest(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PENDING_RECOVERY_STORAGE_KEY)) === '1';
  } catch {
    return false;
  }
}

async function clearPendingPasswordRecoveryRequest(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_RECOVERY_STORAGE_KEY);
  } catch {
    // A failed cleanup does not invalidate the sign-in that just succeeded.
  }
}

/**
 * Called once the reset e-mail is on its way, so the returning link opens the reset
 * form. Failing to store the marker only means the link behaves like a confirmation.
 */
export async function markPasswordRecoveryRequested(): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_RECOVERY_STORAGE_KEY, '1');
  } catch {
    // Never surface a storage failure here: the e-mail has already been sent.
  }
}

/**
 * Outcome of attempting to consume a native deep link.
 *
 * The previous contract returned `Session | null`, which collapsed several different
 * situations into one value: "no link", "an unrelated link", and "the link is expired
 * or invalid". A user tapping a stale link was dropped on the ordinary sign-in form
 * with no feedback and no way to understand what happened.
 *
 * `linkType` matters to the caller: a `recovery` link must force the password-reset
 * screen, whereas a `signup` confirmation only needs to sign the user in. Ignoring the
 * distinction is why e-mail confirmation used to be a dead end — the fragment carried
 * a perfectly valid session that no code consumed.
 */
export type NativeAuthLinkResult =
  | { status: 'none' }
  | { status: 'ok'; session: Session; linkType: SupportedLinkType }
  | { status: 'error'; reason: 'expired_or_invalid' | 'malformed_link' };

const NO_LINK: NativeAuthLinkResult = { status: 'none' };

export async function consumeNativePasswordRecoveryUrl(url: string | null): Promise<NativeAuthLinkResult> {
  if (Platform.OS === 'web' || !url) return NO_LINK;

  const parsed = parseAuthLink(url);
  // Not an auth e-mail link (other deep links are handled elsewhere).
  if (parsed.kind === 'none') return NO_LINK;

  if (parsed.kind === 'implicit_tokens') {
    // B8: this link carries session tokens in the clear, which is precisely what the
    // PKCE flow removes. Refusing it is the point of the fix — accepting it would keep
    // the hole open for anyone able to hand the app such a URL.
    return { status: 'error', reason: 'malformed_link' };
  }

  const hasPendingRecoveryRequest = await hasPendingPasswordRecoveryRequest();

  const { data, error } = await supabase.auth.exchangeCodeForSession(parsed.code);
  // Supabase returns an error for an expired, already-used or otherwise rejected
  // code. Surface it instead of discarding it.
  if (error || !data.session) {
    return { status: 'error', reason: 'expired_or_invalid' };
  }

  await clearPendingPasswordRecoveryRequest();

  return {
    status: 'ok',
    session: data.session,
    linkType: resolveLinkType(parsed.declaredType, hasPendingRecoveryRequest),
  };
}

export async function getInitialNativePasswordRecoverySession(): Promise<NativeAuthLinkResult> {
  return consumeNativePasswordRecoveryUrl(await Linking.getInitialURL());
}

export function subscribeToNativePasswordRecovery(
  onResult: (result: NativeAuthLinkResult) => void,
) {
  if (Platform.OS === 'web') return () => undefined;

  const subscription = Linking.addEventListener('url', ({ url }) => {
    void consumeNativePasswordRecoveryUrl(url).then(onResult);
  });

  return () => subscription.remove();
}
