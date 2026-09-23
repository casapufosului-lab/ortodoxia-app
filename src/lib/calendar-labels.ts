import type { CalendarCode, TranslationKey } from '@/i18n/config';

/**
 * Localized presentation for the calendar picker.
 *
 * WHY THIS EXISTS
 * ---------------
 * `CALENDAR_OPTIONS` in `src/i18n/config.ts` carries `label`, `description` and
 * `jurisdictionLabel` as Romanian string literals, and three screens rendered them
 * directly:
 *
 *   account.tsx    calendar option name, jurisdiction and description
 *   calendar.tsx   page header subtitle and accessibility label
 *   index.tsx      the Moldova notice
 *
 * The result was that a Greek, Serbian or Georgian user picked a calendar from a list
 * written in Romanian. The labels also hardcoded the year ("Calendar ortodox românesc
 * 2026"), which goes stale the moment the next year's data is seeded.
 *
 * The picker is now driven by the localized jurisdiction name plus the canonical
 * calendar code, so it stays correct in every language and carries no year.
 *
 * The canonical `label` / `description` / `jurisdictionLabel` fields are intentionally
 * left in place in config.ts: `docs/` and the content tools reference them, and they
 * remain the Romanian editorial source of truth. They are simply no longer rendered.
 */

/** i18n key for the jurisdiction (church body) behind each calendar. */
const JURISDICTION_KEYS: Record<CalendarCode, TranslationKey> = {
  'ro-bor': 'calendar.jurisdictionRoBor',
  'md-basarabia': 'calendar.jurisdictionMdBasarabia',
  'md-chisinau': 'calendar.jurisdictionMdChisinau',
  'gr-church-of-greece': 'calendar.jurisdictionGr',
  'cy-church-of-cyprus': 'calendar.jurisdictionCy',
  'rs-serbian-orthodox-church': 'calendar.jurisdictionRs',
  'me-metropolitanate-montenegro-littoral': 'calendar.jurisdictionMe',
  'ua-orthodox-church-of-ukraine': 'calendar.jurisdictionUa',
  'bg-bulgarian-patriarchate': 'calendar.jurisdictionBg',
  'mk-macedonian-orthodox-church': 'calendar.jurisdictionMk',
  'ge-georgian-orthodox-church': 'calendar.jurisdictionGe',
  'ru-russian-orthodox-church': 'calendar.jurisdictionRu',
  'by-belarusian-orthodox-church': 'calendar.jurisdictionBy',
  'al-orthodox-autocephalous-church': 'calendar.jurisdictionAl',
};

/** i18n key for a one-line description of each calendar. */
const DESCRIPTION_KEYS: Record<CalendarCode, TranslationKey> = {
  'ro-bor': 'calendar.descriptionRoBor',
  'md-basarabia': 'calendar.descriptionMdBasarabia',
  'md-chisinau': 'calendar.descriptionMdChisinau',
  'gr-church-of-greece': 'calendar.descriptionGr',
  'cy-church-of-cyprus': 'calendar.descriptionCy',
  'rs-serbian-orthodox-church': 'calendar.descriptionRs',
  'me-metropolitanate-montenegro-littoral': 'calendar.descriptionMe',
  'ua-orthodox-church-of-ukraine': 'calendar.descriptionUa',
  'bg-bulgarian-patriarchate': 'calendar.descriptionBg',
  'mk-macedonian-orthodox-church': 'calendar.descriptionMk',
  'ge-georgian-orthodox-church': 'calendar.descriptionGe',
  'ru-russian-orthodox-church': 'calendar.descriptionRu',
  'by-belarusian-orthodox-church': 'calendar.descriptionBy',
  'al-orthodox-autocephalous-church': 'calendar.descriptionAl',
};

export function calendarJurisdictionKey(code: CalendarCode): TranslationKey | null {
  return JURISDICTION_KEYS[code] ?? null;
}

export function calendarDescriptionKey(code: CalendarCode): TranslationKey | null {
  return DESCRIPTION_KEYS[code] ?? null;
}

/**
 * Resolve the display name for a calendar.
 *
 * `t` is passed in rather than imported so this function stays pure and testable.
 * Returns the localized jurisdiction, falling back to the canonical label when a
 * calendar has no translated jurisdiction (which keeps a newly added calendar usable
 * before its translations land, instead of showing a raw key).
 */
export function calendarDisplayName(
  code: CalendarCode,
  canonicalLabel: string,
  t: (key: TranslationKey) => string,
): string {
  const key = calendarJurisdictionKey(code);
  return key ? t(key) : canonicalLabel;
}

/**
 * Resolve the description for a calendar, with the same fallback contract as
 * {@link calendarDisplayName}.
 */
export function calendarDisplayDescription(
  code: CalendarCode,
  canonicalDescription: string,
  t: (key: TranslationKey) => string,
): string {
  const key = calendarDescriptionKey(code);
  return key ? t(key) : canonicalDescription;
}
