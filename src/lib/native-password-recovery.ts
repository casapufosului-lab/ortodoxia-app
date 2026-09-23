import type { Session } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * A single redirect target for every native auth e-mail.
 *
 * Supabase appends the result as a URL fragment, so one registered scheme handler can
 * serve password recovery AND e-mail confirmation. The `type` parameter distinguishes
 * them.
 */
export const NATIVE_PASSWORD_RECOVERY_REDIRECT_URL = 'ortodoxia://auth';

/** Fragment/query `type` values Supabase uses for implicit-flow e-mail links. */
const SUPPORTED_LINK_TYPES = ['recovery', 'signup', 'magiclink', 'email_change', 'invite'] as const;
type SupportedLinkType = (typeof SUPPORTED_LINK_TYPES)[number];

function isSupportedLinkType(value: string | null): value is SupportedLinkType {
  return value !== null && (SUPPORTED_LINK_TYPES as readonly string[]).includes(value);
}

function getUrlParam(url: string, name: string) {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const query =
    queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : '';
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';

  return new URLSearchParams(hash).get(name) ?? new URLSearchParams(query).get(name);
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

  const linkType = getUrlParam(url, 'type');
  // Not an auth e-mail link (other deep links are handled elsewhere).
  if (!isSupportedLinkType(linkType)) return NO_LINK;

  const accessToken = getUrlParam(url, 'access_token');
  const refreshToken = getUrlParam(url, 'refresh_token');
  if (!accessToken || !refreshToken) {
    return { status: 'error', reason: 'malformed_link' };
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  // Supabase returns an error for an expired, already-used or otherwise rejected
  // token. Surface it instead of discarding it.
  if (error || !data.session) {
    return { status: 'error', reason: 'expired_or_invalid' };
  }

  return { status: 'ok', session: data.session, linkType };
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
