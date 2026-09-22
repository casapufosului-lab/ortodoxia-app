import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { markStartup } from '@/lib/startup-timing';
import {
  detectDeviceLanguage,
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
  // First launch follows the device language instead of assuming Romanian. The
  // user's explicit choice always wins once stored.
  const [languageCode, setLanguageCodeState] = useState<LanguageCode>(
    () => detectDeviceLanguage() ?? 'ro',
  );
  const [calendarPreferences, setCalendarPreferences] = useState<CalendarPreferences>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      AsyncStorage.getItem(COUNTRY_STORAGE_KEY),
      AsyncStorage.getItem(CALENDAR_STORAGE_KEY),
      AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
    ])
      .then(([savedCountry, savedCalendars, savedLanguage]) => {
        if (!active) return;

        // Language precedence: an explicit stored choice wins; otherwise keep the
        // device-detected language chosen at first launch. The seed value is
        // deliberately NOT run through resolveLanguageCode, because that function
        // maps a missing value to Romanian and would undo device detection.
        if (savedLanguage.status === 'fulfilled' && savedLanguage.value) {
          setLanguageCodeState(resolveLanguageCode(savedLanguage.value));
        } else if (savedLanguage.status === 'rejected') {
          console.error('Failed to restore language preference:', savedLanguage.reason);
        }

        if (savedCountry.status === 'fulfilled') {
          setCountryCodeState(getRegion(savedCountry.value).countryCode);
        } else {
          console.error('Failed to restore country preference:', savedCountry.reason);
        }
        if (savedCalendars.status === 'rejected') {
          console.error('Failed to restore calendar preferences:', savedCalendars.reason);
        } else if (savedCalendars.value) {
          try {
            const parsed = JSON.parse(savedCalendars.value) as CalendarPreferences;
            setCalendarPreferences(parsed);
          } catch (error) {
            console.error('Failed to parse calendar preferences:', error);
            setCalendarPreferences({});
          }
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
          // The single gate in front of the navigator: everything below this provider
          // renders only after this resolves (see src/components/splash-gate.tsx).
          markStartup('providersReady');
        }
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
        // The thrown text is developer-facing (no screen renders it), but a Romanian
        // literal here still bypasses the corpus; the audit flags it as hardcoded copy.
        throw new Error(translate(languageCode, 'region.calendarUnavailable'));
      }
      const nextPreferences = { ...calendarPreferences, [countryCode]: nextCalendarCode };
      setCalendarPreferences(nextPreferences);
      await AsyncStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(nextPreferences));
    },
    setCountryCode: async (nextCountryCode) => {
      setCountryCodeState(nextCountryCode);
      await AsyncStorage.setItem(COUNTRY_STORAGE_KEY, nextCountryCode);

      // Selecting a country also selects its language, but ONLY while the user has
      // never made an explicit language choice. Without this, a first-time user in
      // Greece who picks Greece would still see Romanian UI.
      try {
        const explicitLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (!explicitLanguage) {
          const regionLanguage = getRegion(nextCountryCode).languageCode;
          setLanguageCodeState(regionLanguage);
        }
      } catch (error) {
        console.error('Failed to align language with the selected country:', error);
      }
    },
    setLanguageCode: async (nextLanguageCode) => {
      setLanguageCodeState(nextLanguageCode);
      // Mark the choice as explicit so a later country change will not override it.
      try {
        await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguageCode);
      } catch (error) {
        console.error('Failed to save language preference:', error);
      }
    },
    t: (key) => translate(languageCode, key),
  }), [availableCalendars, calendar, calendarCode, calendarPreferences, countryCode, isLoading, languageCode, region]);

  if (isLoading) return null;

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  const context = useContext(LocalizationContext);
  if (!context) throw new Error('useLocalization trebuie folosit în interiorul LocalizationProvider.');
  return context;
}
