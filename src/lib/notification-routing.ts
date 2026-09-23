/**
 * Pure notification payload routing.
 *
 * Kept free of any Expo/native import so it can be unit-tested in plain Node and so
 * the sanitisation rules have exactly one home.
 */

/** Payload shape attached to the daily push by the Edge Function. */
export type DailyNotificationData = {
  url?: unknown;
  contentDate?: unknown;
  notificationType?: unknown;
};

/**
 * Route to open when a daily notification is tapped.
 *
 * The Edge Function has always sent `data.url` (plus `contentDate` and
 * `notificationType`), but no code ever read it, so tapping a notification simply
 * opened the app on whatever screen was last active.
 *
 * Only a relative path the app itself controls is accepted. Anything else — an
 * absolute URL, a scheme, a protocol-relative value, an empty or non-string value —
 * falls back to the home screen, so a forged push payload cannot redirect the user
 * off-app.
 */
export function resolveNotificationRoute(data: DailyNotificationData | null | undefined): string {
  const url = typeof data?.url === 'string' ? data.url.trim() : '';
  if (!url) return '/';
  if (!url.startsWith('/')) return '/';
  if (url.startsWith('//') || url.includes('://')) return '/';
  return url;
}
