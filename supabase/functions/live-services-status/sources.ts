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
