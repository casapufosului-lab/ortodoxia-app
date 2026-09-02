import type { PermanentLiveSource } from './types';

/**
 * CANONICAL PERMANENT SOURCE REGISTRY for "Slujbe LIVE".
 *
 * This is the ONE place where official sources are declared. UI components
 * must NOT scatter URLs or channel IDs. LIVE-B finds sources here and plugs
 * dynamic detection into this architecture without rewriting the UI model.
 *
 * This registry describes the PERMANENT SOURCE and must NEVER contain the
 * current Sunday `videoId` as permanent configuration. One-off live video
 * IDs belong only in transient `CurrentLiveBroadcast` objects (LIVE-B).
 */

/** Domains explicitly allowed for opening in this feature. */
export const ALLOWED_DOMAINS = [
  'trinitas.tv',
  'www.trinitas.tv',
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'doxologia.ro',
  'www.doxologia.ro',
  'putna.ro',
  'www.putna.ro',
  'sihastria.ro',
  'www.sihastria.ro',
  'radiorenasterea.ro',
  'www.radiorenasterea.ro',
  'mitropolia-clujului.ro',
  'www.mitropolia-clujului.ro',
  'patriarhia.ro',
  'www.patriarhia.ro',
] as const;

/** A stable handle on an allowed domain (used for quick lookups). */
const DOMAIN_SET = new Set<string>(ALLOWED_DOMAINS);

export function isAllowedDomain(hostname: string): boolean {
  return DOMAIN_SET.has(hostname.toLowerCase());
}

/**
 * Canonical permanent live sources.
 *
 * NOTE ON ENABLED STATE:
 * - `trinitas-tv`, `doxologia`, `putna`, `radio-renasterea` are ENABLED
 *   because official provenance was confidently established (official
 *   organization website links to the channel, or the channel is clearly
 *   the organization's official handle).
 * - `sihastria` is DISABLED in this task because the official monastery
 *   website could not be reached to confirm the channel is linked from it,
 *   and the channel description could not be independently validated to
 *   link back to the organization. It is kept in the registry (disabled) so
 *   LIVE-B/C can enable it later once provenance is re-verified.
 */
export const LIVE_SOURCES: readonly PermanentLiveSource[] = [
  {
    id: 'trinitas-tv',
    name: 'TRINITAS TV',
    location: 'București',
    provider: 'Patriarhia Română',
    officialWebsiteUrl: 'https://www.trinitas.tv',
    officialChannelUrl: 'https://www.youtube.com/@TrinitasTVOFICIAL',
    officialChannelId: 'UCcqFHIDYfKsaJ5KXZjzW7ZQ',
    streamType: 'youtube',
    priority: 1,
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'doxologia',
    name: 'Doxologia',
    location: 'Iași',
    provider: 'Mitropolia Moldovei și Bucovinei',
    officialWebsiteUrl: 'https://doxologia.ro',
    officialChannelUrl: 'https://www.youtube.com/@doxologia',
    officialChannelId: 'UC48EI8pmHeFuZIn1O4qKu8A',
    streamType: 'youtube',
    priority: 2,
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'putna',
    name: 'Mănăstirea Putna',
    location: 'Putna',
    provider: 'Mănăstirea Putna',
    officialWebsiteUrl: 'https://www.putna.ro',
    officialChannelUrl: 'https://www.youtube.com/@ManastireaPutna',
    officialChannelId: 'UCFwQ9MMZSMYJ8pevvLHS79g',
    streamType: 'youtube',
    priority: 3,
    enabled: true,
    supportsDynamicLiveDetection: true,
    scheduleNote: 'Sfânta Liturghie de duminică este transmisă pe canalul de YouTube al mănăstirii.',
  },
  {
    id: 'sihastria',
    name: 'Mănăstirea Sihăstria',
    location: 'Neamț',
    provider: 'Mănăstirea Sihăstria',
    officialWebsiteUrl: 'https://sihastria.ro',
    officialChannelUrl: 'https://www.youtube.com/@manastireasihastria',
    officialChannelId: 'UCD3L96gliife4V-II9izsPA',
    streamType: 'youtube',
    priority: 4,
    enabled: false,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'radio-renasterea',
    name: 'Radio Renașterea',
    location: 'Cluj-Napoca',
    provider: 'Arhiepiscopia Vadului, Feleacului și Clujului',
    officialWebsiteUrl: 'https://radiorenasterea.ro',
    officialChannelUrl: 'https://www.youtube.com/@Radiorenasterea',
    officialChannelId: 'UCMV6BZET4_LpJlUOaBj-QWw',
    streamType: 'youtube',
    priority: 5,
    enabled: true,
    supportsDynamicLiveDetection: true,
    scheduleNote: 'Sfânta Liturghie de duminică din Catedrala Mitropolitană este transmisă în direct.',
  },
];

/** Enabled sources, sorted by priority. */
export function getEnabledLiveSources(): readonly PermanentLiveSource[] {
  return [...LIVE_SOURCES]
    .filter((source) => source.enabled)
    .sort((a, b) => a.priority - b.priority);
}
