/**
 * Canonical feast-rank model.
 *
 * WHY THIS EXISTS
 * ---------------
 * Historically `calendar_days.feast_rank` stored a Romanian display literal
 * ("cruce roșie" / "cruce neagră") for 8 of the 13 supported countries, and the
 * Greek calendar stored Greek literals. UI and business logic then classified
 * days by substring-matching those literals, which meant:
 *   - non-Romanian users saw raw Romanian/Greek text as the rank label;
 *   - the daily-notification type was derived from a Romanian string compare, so
 *     the Greek calendar could never produce a `red_cross` notification;
 *   - every new calendar had to be added to a hand-maintained marker list.
 *
 * The canonical model below is the single source of truth for CLASSIFICATION.
 * The database mirrors it in `public.calendar_days.feast_rank_code`
 * (migration 20260915000100_add_canonical_feast_rank.sql) and the localized
 * display text is produced by i18n keys at render time only.
 *
 * CONTRACT
 * --------
 * - `FeastRankCode` values are stable identifiers. Never localize them.
 * - `classifyFeastRank()` is a pure fallback used when the backend does not
 *   send a code (old rows, bundled offline calendars, legacy fallback paths).
 * - `feastRankLabelKey()` maps a code to the i18n key used for display.
 * - `isMajorFeast()` / `isRedCross()` answer the business questions the UI and
 *   the notification pipeline actually need.
 */

/** Stable classification of a liturgical day. */
export const FEAST_RANK_CODES = [
  'red_cross',
  'black_cross',
  'great_feast',
  'theotokos_feast',
  'sunday',
] as const;

export type FeastRankCode = (typeof FEAST_RANK_CODES)[number];

/**
 * Display precedence. A day can only carry one rank today, but the ordering is
 * kept explicit so future multi-rank modelling stays deterministic.
 */
const RANK_PRECEDENCE: readonly FeastRankCode[] = [
  'red_cross',
  'great_feast',
  'theotokos_feast',
  'sunday',
  'black_cross',
];

/** Translation key that must exist for every rank code, in every locale. */
export type FeastRankLabelKey =
  | 'calendar.rankRedCross'
  | 'calendar.rankBlackCross'
  | 'calendar.rankGreatFeast'
  | 'calendar.rankTheotokosFeast'
  | 'calendar.rankSunday';

const LABEL_KEYS: Record<FeastRankCode, FeastRankLabelKey> = {
  red_cross: 'calendar.rankRedCross',
  black_cross: 'calendar.rankBlackCross',
  great_feast: 'calendar.rankGreatFeast',
  theotokos_feast: 'calendar.rankTheotokosFeast',
  sunday: 'calendar.rankSunday',
};

/**
 * Legacy literals → canonical code.
 *
 * These are the exact values present in shipped seeds and bundled offline
 * calendars. Matching is diacritic-insensitive and accent-insensitive so that
 * "cruce rosie", "CRUCE ROȘIE" and "Cruce Roșie" all resolve, but the canonical
 * values never depend on a locale.
 */
const LEGACY_LITERAL_MARKERS: readonly { code: FeastRankCode; markers: readonly string[] }[] = [
  { code: 'red_cross', markers: ['red-cross', 'red_cross', 'redcross', 'cruce rosie', 'cruce-rosie'] },
  { code: 'great_feast', markers: ['great feast', 'great-feast', 'major feast', 'veliki praznik', 'δεσποτικη εορτη', 'δεσποτικη εορτή'] },
  { code: 'theotokos_feast', markers: ['theotokos', 'θεομητορικη εορτη', 'θεομητορικη εορτή', 'μεγαλη εορτη'] },
  { code: 'sunday', markers: ['duminica', 'sunday', 'κυριακη'] },
  { code: 'black_cross', markers: ['black-cross', 'black_cross', 'blackcross', 'cruce neagra', 'cruce-neagra'] },
];

/**
 * Normalize a legacy literal for marker matching: lower-case, strip combining
 * diacritics (NFD + combining-mark removal) so Romanian ș/ț/ă/î and Greek
 * tonos do not prevent a match.
 */
export function normalizeRankLiteral(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isFeastRankCode(value: unknown): value is FeastRankCode {
  return typeof value === 'string' && (FEAST_RANK_CODES as readonly string[]).includes(value);
}

/**
 * Classify a rank value that may already be canonical or may be a legacy
 * localized literal. Returns `null` for empty/unrecognized values so callers
 * can render their own neutral fallback instead of inventing a rank.
 */
export function classifyFeastRank(rawRank: string | null | undefined): FeastRankCode | null {
  if (rawRank == null) return null;
  const trimmed = rawRank.trim();
  if (trimmed.length === 0) return null;

  // Canonical values pass straight through.
  if (isFeastRankCode(trimmed)) return trimmed;

  const normalized = normalizeRankLiteral(trimmed);
  for (const { code, markers } of LEGACY_LITERAL_MARKERS) {
    if (markers.some((marker) => normalized.includes(marker))) return code;
  }
  return null;
}

/**
 * Resolve the rank the UI should use, preferring the canonical code the backend
 * now sends and falling back to classification of the raw literal.
 */
export function resolveFeastRankCode(
  canonicalCode: string | null | undefined,
  rawRank: string | null | undefined,
): FeastRankCode | null {
  if (isFeastRankCode(canonicalCode)) return canonicalCode;
  return classifyFeastRank(rawRank);
}

export function feastRankLabelKey(code: FeastRankCode | null): FeastRankLabelKey | null {
  return code ? LABEL_KEYS[code] : null;
}

/** A "red cross" day is the strongest calendar mark (Romanian: cruce roșie). */
export function isRedCross(code: FeastRankCode | null): boolean {
  return code === 'red_cross';
}

/**
 * Major feasts get the red calendar mark. `red_cross` already implies a red
 * mark; the Lord's and Theotokos' feasts are also marked red.
 */
export function isMajorFeast(code: FeastRankCode | null): boolean {
  return code === 'red_cross' || code === 'great_feast' || code === 'theotokos_feast';
}

/**
 * Pick the highest-precedence rank from a set of codes. Kept exported so future
 * multi-rank days (e.g. a feast that is also a Sunday) stay deterministic.
 */
export function highestPrecedenceRank(
  codes: readonly (FeastRankCode | null)[],
): FeastRankCode | null {
  for (const candidate of RANK_PRECEDENCE) {
    if (codes.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * True when a localized-calendar RPC failure means "the function is not usable",
 * so the caller should fall back to reading `calendar_days` directly.
 *
 * Covered cases:
 *   PGRST202 — PostgREST could not find the function in its schema cache;
 *   42883    — PostgreSQL "function does not exist";
 *   42702    — "column reference is ambiguous". This is the failure mode of the
 *              ORIGINAL definition of get_calendar_days_localized, whose
 *              RETURNS TABLE columns collided with its own SELECT identifiers.
 *              Without this code the UI reported a generic load error instead of
 *              falling back, so the ambiguity is treated as "RPC unavailable".
 *   PGRST203 — PostgREST "could not choose the best candidate function".
 */
export function isCalendarRpcUnavailable(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42702' || error.code === 'PGRST203') {
    return true;
  }
  return /get_calendar_days_localized|ambiguous/i.test(error.message ?? '');
}

/**
 * Inclusive range of calendar dates the backend actually has data for.
 *
 * Only the 2026 liturgical calendars are seeded; the 2027 editions are not
 * published yet, so they cannot be generated. The grid previously allowed
 * unbounded month navigation, which produced a completely empty calendar with no
 * explanation once the user stepped outside the seeded year.
 */
export const SEEDED_CALENDAR_RANGE = {
  firstMonth: '2026-01',
  lastMonth: '2026-12',
} as const;

/** True when the given `YYYY-MM` month has seeded calendar data. */
export function isMonthInSeededRange(monthKey: string): boolean {
  return monthKey >= SEEDED_CALENDAR_RANGE.firstMonth
    && monthKey <= SEEDED_CALENDAR_RANGE.lastMonth;
}

/**
 * True when the given date (UTC-anchored calendar date) is a Sunday.
 *
 * The calendar grid previously marked the last column (`index % 7 === 6`) as
 * Sunday, which is only correct when the month starts on a Monday. This computes
 * the real weekday instead.
 */
export function isSundayDateKey(dateKey: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
}
