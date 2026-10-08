/**
 * Parsing of the deep links Supabase sends back to the app.
 *
 * B8 (security): the implicit flow returned `access_token` and `refresh_token` in the
 * URL fragment. On Android any application may register the same custom scheme, so a
 * URL that carries a live session is a session handed to whoever asks for it. The
 * client now uses the PKCE flow (see `flowType` in `src/lib/supabase.ts`), which puts a
 * single-use, short-lived `code` in the link instead. A link that still arrives with
 * raw tokens is refused here rather than consumed, so a replayed or stale link cannot
 * install a session behind the user's back.
 *
 * This module is intentionally free of imports (and of side effects) so the tests can
 * exercise the real function instead of grepping its source.
 */

/** `type` values Supabase uses on auth e-mail links. */
export const SUPPORTED_LINK_TYPES = ['recovery', 'signup', 'magiclink', 'email_change', 'invite'] as const;

export type SupportedLinkType = (typeof SUPPORTED_LINK_TYPES)[number];

export function isSupportedLinkType(value: string | null): value is SupportedLinkType {
  return value !== null && (SUPPORTED_LINK_TYPES as readonly string[]).includes(value);
}

/** Reads a parameter from either the query string or the fragment of a URL. */
export function getUrlParam(url: string, name: string): string | null {
  const queryIndex = url.indexOf('?');
  const hashIndex = url.indexOf('#');
  const query =
    queryIndex >= 0 ? url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined) : '';
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';

  return new URLSearchParams(hash).get(name) ?? new URLSearchParams(query).get(name);
}

/** Session material the implicit flow used to put in the link. */
const IMPLICIT_TOKEN_PARAMS = ['access_token', 'refresh_token'] as const;

export type ParsedAuthLink =
  | { kind: 'code'; code: string; declaredType: SupportedLinkType | null }
  /** A link from the old implicit flow (or a forged one): it must not be consumed. */
  | { kind: 'implicit_tokens' }
  /** Not an auth e-mail link, or not one this app can turn into a session. */
  | { kind: 'none' };

export function parseAuthLink(url: string | null): ParsedAuthLink {
  if (!url) return { kind: 'none' };

  if (IMPLICIT_TOKEN_PARAMS.some((name) => getUrlParam(url, name) !== null)) {
    return { kind: 'implicit_tokens' };
  }

  const code = getUrlParam(url, 'code')?.trim();
  if (!code) return { kind: 'none' };

  const linkType = getUrlParam(url, 'type');

  return { kind: 'code', code, declaredType: isSupportedLinkType(linkType) ? linkType : null };
}

/**
 * Which screen a consumed link should open.
 *
 * The exchanged code does not say why it was issued, so the caller passes whether the
 * app itself asked for a password reset on this device (see
 * `markPasswordRecoveryRequested`). Without that memory a reset link opened elsewhere
 * still signs the user in, it just no longer forces the reset form.
 */
export function resolveLinkType(
  declaredType: SupportedLinkType | null,
  hasPendingRecoveryRequest: boolean,
): SupportedLinkType {
  if (declaredType === 'recovery' || hasPendingRecoveryRequest) return 'recovery';

  return declaredType ?? 'signup';
}
