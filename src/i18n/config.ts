export type CountryCode = 'RO' | 'MD';
export type LanguageCode = 'ro';
export type CalendarCode = 'ro-bor' | 'md-basarabia' | 'md-chisinau';

export type RegionConfig = {
  countryCode: CountryCode;
  countryLabel: string;
  currencyCode: 'RON' | 'MDL';
  languageCode: LanguageCode;
  languageLabel: string;
  locale: 'ro-RO' | 'ro-MD';
  timeZone: 'Europe/Bucharest' | 'Europe/Chisinau';
};

export type CalendarConfig = {
  calendarCode: CalendarCode;
  countryCode: CountryCode;
  description: string;
  jurisdictionLabel: string;
  label: string;
  officialUrl: string;
};

export const DEFAULT_COUNTRY: CountryCode = 'RO';

export const SUPPORTED_REGIONS: readonly RegionConfig[] = [
  {
    countryCode: 'RO',
    countryLabel: 'România',
    currencyCode: 'RON',
    languageCode: 'ro',
    languageLabel: 'Română',
    locale: 'ro-RO',
    timeZone: 'Europe/Bucharest',
  },
  {
    countryCode: 'MD',
    countryLabel: 'Republica Moldova',
    currencyCode: 'MDL',
    languageCode: 'ro',
    languageLabel: 'Română',
    locale: 'ro-MD',
    timeZone: 'Europe/Chisinau',
  },
] as const;

export const CALENDAR_OPTIONS: readonly CalendarConfig[] = [
  {
    calendarCode: 'ro-bor',
    countryCode: 'RO',
    description: 'Calendarul Bisericii Ortodoxe Române.',
    jurisdictionLabel: 'Patriarhia Română',
    label: 'Calendar ortodox românesc 2026',
    officialUrl: 'https://calendar.patriarhia.ro/',
  },
  {
    calendarCode: 'md-basarabia',
    countryCode: 'MD',
    description: 'Mitropolia Basarabiei, autonomă și de stil vechi.',
    jurisdictionLabel: 'Patriarhia Română',
    label: 'Mitropolia Basarabiei',
    officialUrl: 'https://mitropoliabasarabiei.md/',
  },
  {
    calendarCode: 'md-chisinau',
    countryCode: 'MD',
    description: 'Mitropolia Chișinăului și a Întregii Moldove.',
    jurisdictionLabel: 'Biserica Ortodoxă Rusă',
    label: 'Mitropolia Moldovei',
    officialUrl: 'https://mitropolia.md/',
  },
] as const;

export function getRegion(countryCode: string | null | undefined): RegionConfig {
  return SUPPORTED_REGIONS.find((region) => region.countryCode === countryCode)
    ?? SUPPORTED_REGIONS[0];
}

export function getCalendarsForCountry(countryCode: CountryCode) {
  return CALENDAR_OPTIONS.filter((calendar) => calendar.countryCode === countryCode);
}

export function getCalendar(
  calendarCode: string | null | undefined,
  countryCode: CountryCode,
): CalendarConfig | null {
  return CALENDAR_OPTIONS.find((calendar) => (
    calendar.calendarCode === calendarCode && calendar.countryCode === countryCode
  )) ?? null;
}

export function getDefaultCalendar(countryCode: CountryCode): CalendarConfig | null {
  if (countryCode === 'MD') return null;
  return getCalendarsForCountry(countryCode)[0] ?? null;
}

const ro = {
  'nav.home': 'Acasă',
  'nav.prayers': 'Rugăciuni',
  'nav.calendar': 'Calendar',
  'nav.bible': 'Biblia',
  'nav.chat': 'Întreabă',
  'nav.account': 'Cont',
  'account.regionTitle': 'Țară și limbă',
  'account.regionDescription': 'Țara stabilește calendarul, sursele locale și moneda. Limba poate fi schimbată separat când adăugăm traduceri noi.',
  'account.language': 'Limba',
  'account.country': 'Țara',
  'account.calendar': 'Calendar bisericesc',
  'account.calendarDescription': 'În Republica Moldova alegi jurisdicția al cărei calendar vrei să îl urmărești.',
  'account.calendarRequired': 'Alege unul dintre cele două calendare pentru a continua.',
  'region.moldovaCalendarPending': 'Calendarul ales este salvat. Conținutul local va fi publicat numai după verificarea surselor bisericești.',
  'region.moldovaChooseCalendar': 'Alege calendarul bisericesc pentru Republica Moldova. Aplicația nu alege automat în locul tău.',
  'calendar.moldovaUnavailable': 'Calendarul ortodox pentru Republica Moldova nu este disponibil momentan.',
} as const;

export type TranslationKey = keyof typeof ro;

const translations: Record<LanguageCode, Record<TranslationKey, string>> = { ro };

export function translate(languageCode: LanguageCode, key: TranslationKey) {
  return translations[languageCode][key];
}

export function dateKeyInTimeZone(date: Date, timeZone: RegionConfig['timeZone']) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
