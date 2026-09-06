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
  'common.retry': 'Reîncearcă',
  'common.chooseCalendar': 'Alege calendarul',

  'home.pageTitle': 'Pace ție',
  'home.pageSubtitle': 'Un loc simplu pentru rugăciune, calendar și întrebări.',
  'home.loadError': 'Conținutul zilei nu a putut fi încărcat. Încearcă din nou.',
  'home.unexpectedError': 'A apărut o eroare neașteptată.',
  'home.loadingToday': 'Se încarcă ziua de astăzi...',
  'home.verseFallback': '„Pacea Mea o dau vouă.”',
  'home.verseSourceFallback': 'Ioan 14, 27',
  'home.parableSectionTitle': 'Pilda zilei',
  'home.parableTitleFallback': 'Pilda semănătorului',
  'home.parableBodyFallback': 'Un suflet atent primește cuvântul bun și îl transformă în faptă.',
  'home.calendarSectionTitle': 'Astăzi în calendar',
  'home.calendarDayFallback': 'Astăzi în calendarul ortodox',
  'home.liveSectionTitle': 'Slujbe LIVE',
  'home.liveAccessibilityLabel': 'Slujbe LIVE — Urmărește Sfânta Liturghie în direct',
  'home.liveSubtitle': 'Urmărește Sfânta Liturghie în direct',
  'home.liveLocations': 'București • Iași • Putna • Sihăstria • Cluj',
  'home.askAiGuide': 'Întreabă ghidul AI',

  'prayers.eyebrow': 'Bibliotecă',
  'prayers.subtitle': 'Caută după titlu și păstrează rugăciunile apropiate inimii tale.',
  'prayers.aiVoiceNotice': 'Înregistrările naturale sunt voci generate cu inteligență artificială.',
  'prayers.search': 'Caută o rugăciune',
  'prayers.searchHint': 'Poți căuta cu sau fără diacritice, de exemplu: „tatal nostru”.',
  'prayers.loading': 'Se încarcă rugăciunile...',
  'prayers.read': 'Citește rugăciunea',
  'prayers.close': 'Închide',
  'prayers.audioPlay': '▶ Ascultă',
  'prayers.audioStop': '■ Oprește',
  'prayers.audioPlayAccessibility': 'Ascultă',
  'prayers.audioStopAccessibility': 'Oprește',
  'prayers.favoriteAdd': 'Adaugă la favorite',
  'prayers.favoriteRemove': 'Elimină din favorite',
  'prayers.empty': 'Nu există încă rugăciuni publicate.',
  'prayers.notFound': 'Rugăciunea nu este încă în bibliotecă.',
  'prayers.askChat': 'Întreabă Chatul',
  'prayers.loadError': 'Nu am putut încărca rugăciunile. Încearcă din nou.',
  'prayers.favoritesError': 'Rugăciunile s-au încărcat, dar favoritele nu au putut fi citite.',
  'prayers.favoriteError': 'Favoritul nu a fost salvat. Încearcă din nou.',
  'prayers.audioStartError': 'Fișierul audio nu a putut porni. Încearcă din nou.',
  'prayers.audioUnavailableError': 'Citirea audio nu a putut porni pe acest dispozitiv.',

  'calendar.eyebrow': 'An bisericesc',
  'calendar.title': 'Calendar ortodox',
  'calendar.subtitleFallback': 'Alege calendarul bisericesc pe care vrei să îl urmărești.',
  'calendar.unavailableTitle': 'Calendar indisponibil',
  'calendar.loading': 'Se încarcă calendarul...',
  'calendar.loadingDay': 'Se încarcă informațiile zilei...',
  'calendar.previousMonth': 'Luna anterioară',
  'calendar.nextMonth': 'Luna următoare',
  'calendar.backToCurrentMonth': 'Revino la luna curentă',
  'calendar.redCrossLegend': 'sărbătoare cu cruce roșie',
  'calendar.documentedDayLegend': 'zi înscrisă în calendar',
  'calendar.emptyDay': 'Nu există încă informații publicate pentru această zi.',
  'calendar.feastRankFallback': 'Pomenire',
  'calendar.selectDay': 'Selectează ziua',
  'calendar.loadError': 'Calendarul nu a putut fi încărcat. Încearcă din nou.',

  'bible.title': 'Biblia, aproape de tine',
  'bible.subtitle': 'Alege cartea și capitolul pentru a citi în ritmul tău.',
  'bible.sourceLabel': 'Sursa biblică',
  'bible.sourceDescription': 'Noul Testament, traducere în curs de revizuire și disponibilă în domeniul public. Nu este prezentată drept ediția sinodală ortodoxă.',
  'bible.sourceLink': 'Vezi sursa și condițiile de folosire',
  'bible.bookSection': 'Carte',
  'bible.chapterSection': 'Capitol',
  'bible.previousChapter': 'Capitolul anterior',
  'bible.nextChapter': 'Capitolul următor',
  'bible.search': 'Caută în capitolul curent',
  'bible.loading': 'Se încarcă textul...',
  'bible.retry': 'Încearcă din nou',
  'bible.loadError': 'Textul nu s-a putut încărca. Verifică internetul și încearcă din nou.',
  'bible.emptyChapter': 'Acest capitol nu are încă versete publicate.',
  'bible.noSearchResults': 'Nu am găsit acest cuvânt în capitolul curent.',
  'bible.openSource': 'Deschide sursa originală',
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
