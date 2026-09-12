/**
 * Canonical source registry for the live-services-status Edge Function.
 *
 * This is the SERVER-SIDE single source of truth. A drift-consistency test
 * (tests/live-status.test.mjs) verifies this stays in sync with the
 * canonical client-side registry in src/live/live-services.ts.
 *
 * Disabled sources consume ZERO YouTube discovery quota.
 * One-off videoId NEVER enters this file — this is permanent configuration.
 */

export interface LiveSourceDef {
  readonly id: string;
  readonly countryCode: string;
  readonly officialChannelId: string;
  readonly enabled: boolean;
  readonly supportsDynamicLiveDetection: boolean;
}

export const LIVE_SOURCES: readonly LiveSourceDef[] = [
  {
    id: 'trinitas-tv',
    countryCode: 'RO',
    officialChannelId: 'UCcqFHIDYfKsaJ5KXZjzW7ZQ',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'doxologia',
    countryCode: 'RO',
    officialChannelId: 'UC48EI8pmHeFuZIn1O4qKu8A',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'putna',
    countryCode: 'RO',
    officialChannelId: 'UCFwQ9MMZSMYJ8pevvLHS79g',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'sihastria',
    countryCode: 'RO',
    officialChannelId: 'UCD3L96gliife4V-II9izsPA',
    enabled: false,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'radio-renasterea',
    countryCode: 'RO',
    officialChannelId: 'UCMV6BZET4_LpJlUOaBj-QWw',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'gr-corfu',
    countryCode: 'GR',
    officialChannelId: 'UC-ox8zScPlH6xz9XbW6qD7g',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'gr-4e',
    countryCode: 'GR',
    officialChannelId: 'UCme3CT1jvhMFAHDhY589Eyw',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'cy-tamasos',
    countryCode: 'CY',
    officialChannelId: 'UCYoHUCkzSJ3388LgfR0cLOQ',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'cy-kykkos',
    countryCode: 'CY',
    officialChannelId: 'UCb-R-Q9gHsx2NGHAuGmViGA',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'cy-constantias',
    countryCode: 'CY',
    officialChannelId: 'UCPK1fmyUVKgzIs-e-J2Cf2Q',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'cy-paphos',
    countryCode: 'CY',
    officialChannelId: 'UC_XV53qPmRZOCk_ghQZKR_g',
    enabled: true,
    supportsDynamicLiveDetection: false,
  },
  {
    id: 'rs-tv-hram',
    countryCode: 'RS',
    officialChannelId: 'UCXnRkfjybyv7931skQWumDQ',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'rs-sumadija',
    countryCode: 'RS',
    officialChannelId: 'UCFt8ASyX5TKQrYDe1u69tmg',
    enabled: true,
    supportsDynamicLiveDetection: false,
  },
  {
    id: 'rs-tumane',
    countryCode: 'RS',
    officialChannelId: 'UCg-nhkZOWy8Qi0r4st-u2VQ',
    enabled: true,
    supportsDynamicLiveDetection: false,
  },
  {
    id: 'ua-ocu',
    countryCode: 'UA',
    officialChannelId: 'UCFgJSKKWeYsoJLeJoeQVFdg',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ua-uoc',
    countryCode: 'UA',
    officialChannelId: 'UCR912pfv8uTtWr9h4YzJA6Q',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ua-pochaiv-lavra',
    countryCode: 'UA',
    officialChannelId: 'UCUmvxPTUfflU3v_mcRNGAeg',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ua-kyiv-pechersk-lavra',
    countryCode: 'UA',
    officialChannelId: 'UCKzsQXAGrL_0jWlTBgGey1Q',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ua-sviatogirsk-lavra',
    countryCode: 'UA',
    officialChannelId: 'UCZ8xSa5ceifaA5hVIIXzq-g',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ua-odesa-cathedral',
    countryCode: 'UA',
    officialChannelId: 'UCH-3BH5X3lNH6JiKGMMi7IQ',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'bg-patriarchate',
    countryCode: 'BG',
    officialChannelId: 'UCJJc8kgu0rSKoyCnZiSRLXA',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'bg-plovdiv',
    countryCode: 'BG',
    officialChannelId: 'UC9AoegqiRGrm1IQie6YDCcg',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'mk-mpc-oa',
    countryCode: 'MK',
    officialChannelId: 'UCzdcG77BgO89YYprha7P1jA',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'md-basarabia',
    countryCode: 'MD',
    officialChannelId: 'UCfi1ESYseN2DOHSWhdgK-7g',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'md-mitropolia-moldovei',
    countryCode: 'MD',
    officialChannelId: 'UCTevYHEce1AlwkI5YS746Tg',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ru-russianchurch',
    countryCode: 'RU',
    officialChannelId: 'UCABKpHlJJ7qnw_qg2_v95eA',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ru-tv-soyuz',
    countryCode: 'RU',
    officialChannelId: 'UCmT_7bJwaBtmKqhBpwV6hmA',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ru-stslavra',
    countryCode: 'RU',
    officialChannelId: 'UCNBz0LB0EWm1Z5_WuRHvwWg',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ge-patriarchate',
    countryCode: 'GE',
    officialChannelId: 'UCMvmmjwDGh8W3t_b8MPcHZw',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'ge-sstv',
    countryCode: 'GE',
    officialChannelId: 'UCVb1R12ix7LfQEZu5lVW3oQ',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'al-orthodoxalbania',
    countryCode: 'AL',
    officialChannelId: 'UCbkqRu9kElIV3gxhycCHKxQ',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'by-church',
    countryCode: 'BY',
    officialChannelId: 'UCYFr-IXbe8u8yhoM_QHw_LQ',
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
];

/** Enabled sources eligible for dynamic YouTube discovery. */
export function getEligibleSources(countryCode: string = 'RO'): readonly LiveSourceDef[] {
  return LIVE_SOURCES.filter(
    (s) => s.countryCode === countryCode && s.enabled && s.supportsDynamicLiveDetection,
  );
}

/** Resolve a known source by ID. Returns undefined for unknown IDs. */
export function getSourceById(id: string): LiveSourceDef | undefined {
  return LIVE_SOURCES.find((s) => s.id === id);
}
