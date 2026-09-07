import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import {
  getCalendar,
  getCalendarsForCountry,
  getDefaultCalendar,
  DEFAULT_COUNTRY,
  getRegion,
  translate,
  resolveLanguageCode,
  type CalendarCode,
  type CountryCode,
  type LanguageCode,
  type TranslationKey,
} from '@/i18n/config';

const COUNTRY_STORAGE_KEY = 'ortodoxia.country';
const CALENDAR_STORAGE_KEY = 'ortodoxia.calendar-preferences';
const LANGUAGE_STORAGE_KEY = 'ortodoxia.language';

type CalendarPreferences = Partial<Record<CountryCode, CalendarCode>>;

type LocalizationContextValue = {
  availableCalendars: ReturnType<typeof getCalendarsForCountry>;
  calendar: ReturnType<typeof getCalendar>;
  calendarCode: CalendarCode | null;
  countryCode: CountryCode;
  isLoading: boolean;
  languageCode: LanguageCode;
  region: ReturnType<typeof getRegion>;
  setCalendarCode: (calendarCode: CalendarCode) => Promise<void>;
  setCountryCode: (countryCode: CountryCode) => Promise<void>;
  setLanguageCode: (languageCode: LanguageCode) => Promise<void>;
  t: (key: TranslationKey) => string;
};

const LocalizationContext = createContext<LocalizationContextValue | null>(null);

export function LocalizationProvider({ children }: PropsWithChildren) {
  const [countryCode, setCountryCodeState] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [languageCode, setLanguageCodeState] = useState<LanguageCode>('ro');
  const [calendarPreferences, setCalendarPreferences] = useState<CalendarPreferences>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.all([
      AsyncStorage.getItem(COUNTRY_STORAGE_KEY),
      AsyncStorage.getItem(CALENDAR_STORAGE_KEY),
      AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
    ])
      .then(([savedCountry, savedCalendars, savedLanguage]) => {
        if (!active) return;
        setCountryCodeState(getRegion(savedCountry).countryCode);
        setLanguageCodeState(resolveLanguageCode(savedLanguage));
        if (savedCalendars) {
          try {
            const parsed = JSON.parse(savedCalendars) as CalendarPreferences;
            setCalendarPreferences(parsed);
          } catch {
            setCalendarPreferences({});
          }
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => { active = false; };
  }, []);

  const region = getRegion(countryCode);
  const availableCalendars = getCalendarsForCountry(countryCode);
  const savedCalendarCode = calendarPreferences[countryCode];
  const calendar = getCalendar(savedCalendarCode, countryCode) ?? getDefaultCalendar(countryCode);
  const calendarCode = calendar?.calendarCode ?? null;

  const value = useMemo<LocalizationContextValue>(() => ({
    availableCalendars,
    calendar,
    calendarCode,
    countryCode,
    isLoading,
    languageCode,
    region,
    setCalendarCode: async (nextCalendarCode) => {
      if (!getCalendar(nextCalendarCode, countryCode)) {
        throw new Error('Calendarul ales nu este disponibil pentru această țară.');
      }
      const nextPreferences = { ...calendarPreferences, [countryCode]: nextCalendarCode };
      setCalendarPreferences(nextPreferences);
      await AsyncStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(nextPreferences));
    },
    setCountryCode: async (nextCountryCode) => {
      setCountryCodeState(nextCountryCode);
      await AsyncStorage.setItem(COUNTRY_STORAGE_KEY, nextCountryCode);
    },
    setLanguageCode: async (nextLanguageCode) => {
      setLanguageCodeState(nextLanguageCode);
      await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguageCode);
    },
    t: (key) => translate(languageCode, key),
  }), [availableCalendars, calendar, calendarCode, calendarPreferences, countryCode, isLoading, languageCode, region]);

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error('useLocalization trebuie folosit în interiorul LocalizationProvider.');
  return context;
}
