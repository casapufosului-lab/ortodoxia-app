import type { PermanentLiveSource } from './types'
import { translate } from '@/i18n/config';

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
  'imcorfu.gr',
  'www.imcorfu.gr',
  'tv4e.gr',
  'www.tv4e.gr',
  'imtamasou.org.cy',
  'www.imtamasou.org.cy',
  'imkykkou.org.cy',
  'www.imkykkou.org.cy',
  'imconstantias.org.cy',
  'www.imconstantias.org.cy',
  'impaphou.org',
  'www.impaphou.org',
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
    countryCode: 'RO',
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
    countryCode: 'RO',
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
    countryCode: 'RO',
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
    scheduleNote: translate('ro', 'live.scheduleNotePutna'),
  },
  {
    id: 'sihastria',
    countryCode: 'RO',
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
    countryCode: 'RO',
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
    scheduleNote: translate('ro', 'live.scheduleNoteRadioRenasterea'),
  },
  {
    id: 'gr-corfu',
    countryCode: 'GR',
    name: 'Mitropolia Corfu',
    location: 'Corfu',
    provider: 'Mitropolia Corfu',
    officialWebsiteUrl: 'https://imcorfu.gr',
    officialChannelUrl: 'https://www.youtube.com/channel/UC-ox8zScPlH6xz9XbW6qD7g',
    officialChannelId: 'UC-ox8zScPlH6xz9XbW6qD7g',
    streamType: 'youtube',
    priority: 1,
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'gr-4e',
    countryCode: 'GR',
    name: '4E Orthodox TV',
    location: 'Salonic',
    provider: '4E',
    officialWebsiteUrl: 'https://tv4e.gr',
    officialChannelUrl: 'https://www.youtube.com/channel/UCme3CT1jvhMFAHDhY589Eyw',
    officialChannelId: 'UCme3CT1jvhMFAHDhY589Eyw',
    streamType: 'youtube',
    priority: 2,
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'cy-tamasos',
    countryCode: 'CY',
    name: 'Mitropolia Tamasos',
    location: 'Episkopeio',
    provider: 'Mitropolia Tamasos and Oreinis',
    officialWebsiteUrl: 'https://www.imtamasou.org.cy',
    officialChannelUrl: 'https://www.youtube.com/channel/UCYoHUCkzSJ3388LgfR0cLOQ',
    officialChannelId: 'UCYoHUCkzSJ3388LgfR0cLOQ',
    streamType: 'youtube',
    priority: 1,
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'cy-kykkos',
    countryCode: 'CY',
    name: 'Kykkos Monastery',
    location: 'Nicosia',
    provider: 'Holy Metropolis of Kykkos and Tillyria',
    officialWebsiteUrl: 'https://imkykkou.org.cy',
    officialChannelUrl: 'https://www.youtube.com/channel/UCb-R-Q9gHsx2NGHAuGmViGA',
    officialChannelId: 'UCb-R-Q9gHsx2NGHAuGmViGA',
    streamType: 'youtube',
    priority: 2,
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'cy-constantias',
    countryCode: 'CY',
    name: 'Metropolis of Constantia and Ammochostos',
    location: 'Paralimni',
    provider: 'Metropolis of Constantia and Ammochostos',
    officialWebsiteUrl: 'https://imconstantias.org.cy',
    officialChannelUrl: 'https://www.youtube.com/channel/UCPK1fmyUVKgzIs-e-J2Cf2Q',
    officialChannelId: 'UCPK1fmyUVKgzIs-e-J2Cf2Q',
    streamType: 'youtube',
    priority: 3,
    enabled: true,
    supportsDynamicLiveDetection: true,
  },
  {
    id: 'cy-paphos',
    countryCode: 'CY',
    name: 'Metropolis of Paphos',
    location: 'Paphos',
    provider: 'Metropolis of Paphos',
    officialWebsiteUrl: 'https://impaphou.org',
    officialChannelUrl: 'https://www.youtube.com/channel/UC_XV53qPmRZOCk_ghQZKR_g',
    officialChannelId: 'UC_XV53qPmRZOCk_ghQZKR_g',
    streamType: 'youtube',
    priority: 4,
    enabled: true,
    supportsDynamicLiveDetection: false,
  },
];

/** Enabled sources, sorted by priority. */
export function getEnabledLiveSources(countryCode: string = 'RO'): readonly PermanentLiveSource[] {
  return [...LIVE_SOURCES]
    .filter((source) => source.enabled && source.countryCode === countryCode)
    .sort((a, b) => a.priority - b.priority);
}
