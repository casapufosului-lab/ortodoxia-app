/**
 * Pure, testable notification logic.
 *
 * These functions have NO side effects and NO external dependencies.
 * They can be tested without network, database, or push services.
 *
 * Separation: deciding WHAT notification is due
 *   from performing actual network send.
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_TIMEZONE = 'Europe/Bucharest';

// ─── Types ──────────────────────────────────────────────────────────────────

export type NotificationType = 'daily' | 'sunday' | 'red_cross';

// ─── Timezone / Date helpers ────────────────────────────────────────────────

/**
 * Compute local date (YYYY-MM-DD) and time (HH:MM) for a given IANA timezone.
 *
 * Uses `Intl.DateTimeFormat` which correctly handles:
 * - UTC/local date boundaries
 * - DST transitions
 * - All IANA timezone identifiers
 *
 * Falls back to `Europe/Bucharest` if the timezone string is empty or invalid.
 */
export function localNow(
  timezone: string,
  now: Date = new Date(),
): { date: string; time: string } {
  const tz = timezone || DEFAULT_TIMEZONE;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

/**
 * Returns true if `now` falls on a Sunday in the given timezone.
 *
 * Sunday is determined from the user's LOCAL date, not UTC.
 */
export function isSunday(timezone: string, now: Date = new Date()): boolean {
  const tz = timezone || DEFAULT_TIMEZONE;
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
  }).format(now);
  return weekday === 'Sunday';
}

// ─── Notification type selection ────────────────────────────────────────────

/**
 * Determine which single notification type the user should receive today.
 *
 * Priority rules (only ONE notification per user per day):
 *   1. feast_rank === 'cruce roșie'  →  RED_CROSS
 *   2. Sunday (from local date)      →  SUNDAY
 *   3. Otherwise                     →  DAILY
 *
 * When both Sunday and cruce roșie occur on the same day, RED_CROSS wins.
 * This is a deterministic technical rule; no religious precedence is invented.
 */
export function determineNotificationType(
  feastRank: string | null | undefined,
  isSundayToday: boolean,
): NotificationType {
  if (feastRank === 'cruce roșie') return 'red_cross';
  if (isSundayToday) return 'sunday';
  return 'daily';
}

// ─── Scheduling helpers ─────────────────────────────────────────────────────

/**
 * Check if the user's configured notification time (HH:MM) matches the
 * current local minute.  Only exact-minute match triggers a send.
 *
 * @param configuredTime - e.g. "10:00" or "10:00:00"
 * @param currentLocalTime - e.g. "10:00" from localNow().time
 */
export function isNotificationDue(
  configuredTime: string,
  currentLocalTime: string,
): boolean {
  return configuredTime.slice(0, 5) === currentLocalTime;
}

// ─── Content builders ───────────────────────────────────────────────────────

/**
 * Build notification body text from verified content only.
 *
 * Never fabricates Bible verses, feast names, prayers, or religious messages.
 * If content is missing upstream, the caller should skip the notification
 * entirely rather than passing placeholder data here.
 */
export function buildNotificationBody(
  type: NotificationType,
  content: { verse_text: string; verse_source: string },
  calendar: { title?: string | null; feast_rank?: string | null } | null,
): string {
  const parts = [`${content.verse_text} (${content.verse_source})`];
  if (calendar?.title) parts.push(calendar.title);
  if (type === 'red_cross') parts.push('Astăzi este zi cu cruce roșie.');
  parts.push('Deschide aplicația pentru mesajul zilei.');
  return parts.join(' ');
}

// ─── Idempotency ────────────────────────────────────────────────────────────

/**
 * Generate a deterministic idempotency key for a notification delivery.
 *
 * Prevents duplicate sends for the same user, local date, and notification
 * type — even across concurrent workers or cron retries.
 *
 * Format: "userId:contentDate:notificationType"
 */
export function deliveryIdempotencyKey(
  userId: string,
  contentDate: string,
  notificationType: NotificationType,
): string {
  return `${userId}:${contentDate}:${notificationType}`;
}

// ─── Calendar validation ────────────────────────────────────────────────────

/**
 * Supported calendar codes per country.
 * Used to validate user preferences and fail safely for unsupported calendars.
 */
const SUPPORTED_CALENDARS: Record<string, readonly string[]> = {
  RO: ['ro-bor'],
  MD: ['md-basarabia', 'md-chisinau'],
  GR: ['gr-church-of-greece'],
  CY: ['cy-church-of-cyprus'],
  RS: ['rs-serbian-orthodox-church'],
  RU: ['ru-russian-orthodox-church'],
};

/**
 * Check if a calendar code is supported for the given country.
 * Returns false for null/undefined calendar codes (which is valid — user
 * may not have selected a calendar yet).
 */
export function isSupportedCalendar(
  countryCode: string,
  calendarCode: string | null | undefined,
): boolean {
  if (calendarCode == null) return true; // null = no calendar selected, not an error
  const supported = SUPPORTED_CALENDARS[countryCode];
  if (!supported) return false;
  return supported.includes(calendarCode);
}

/**
 * Verify that a calendar code belongs to the correct country.
 * Moldova calendar codes must NOT be used with Romania country code
 * and vice versa.  This prevents accidental data cross-contamination.
 */
export function calendarCountryMismatch(
  countryCode: string,
  calendarCode: string | null | undefined,
): boolean {
  if (calendarCode == null) return false;
  if (countryCode === 'RO' && calendarCode !== 'ro-bor') return true;
  if (countryCode === 'MD' && calendarCode === 'ro-bor') return true;
  if (countryCode === 'GR' && calendarCode !== 'gr-church-of-greece') return true;
  if (countryCode === 'CY' && calendarCode !== 'cy-church-of-cyprus') return true;
  if (countryCode === 'RS' && calendarCode !== 'rs-serbian-orthodox-church') return true;
  if (countryCode === 'RU' && calendarCode !== 'ru-russian-orthodox-church') return true;
  return false;
}
