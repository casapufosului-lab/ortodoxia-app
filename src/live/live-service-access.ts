import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';

import { isAllowedDomain } from './live-services';
import type { PermanentLiveSource } from './types';

/**
 * Safe opening of official source URLs for "Slujbe LIVE".
 *
 * Only HTTPS URLs on the allowlist may be opened. Malformed or unapproved
 * URLs fail safely and never crash the app. Ortodoxia is NOT the broadcaster
 * and never downloads/proxies/restreams video — it only opens the official
 * provider's own page.
 */

/** User-facing error code when a source cannot be opened. */
export const LIVE_OPEN_ERROR_CODE = 'OPEN_FAILED';

/** Validate that a URL is HTTPS and on the allowlist. */
export function isValidSourceUrl(rawUrl: string): boolean {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  if (parsed.protocol !== 'https:') return false;
  if (!isAllowedDomain(parsed.hostname)) return false;

  return true;
}

/**
 * Attempt to open a permanent source's official channel/page.
 * Returns a human-readable error code on failure, or null on success.
 */
export async function openLiveSourceUrl(rawUrl: string): Promise<string | null> {
  if (!isValidSourceUrl(rawUrl)) return LIVE_OPEN_ERROR_CODE;

  try {
    await openBrowserAsync(rawUrl.trim(), { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
    return null;
  } catch {
    return LIVE_OPEN_ERROR_CODE;
  }
}

/** Convenience: pick which URL to open for a source (channel preferred, else website). */
export function getOpenableUrlForSource(source: PermanentLiveSource): string | null {
  const candidates = [source.officialChannelUrl, source.officialWebsiteUrl];
  for (const url of candidates) {
    if (isValidSourceUrl(url)) return url;
  }
  return null;
}
