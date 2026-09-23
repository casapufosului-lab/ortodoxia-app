import type { TranslationKey } from '@/i18n/config';

/**
 * Localized display names for the places referenced by the LIVE source registry.
 *
 * WHY A MAP INSTEAD OF A FIELD PER SOURCE
 * --------------------------------------
 * `src/live/live-services.ts` kept `location` and `provider` as Romanian strings
 * and the Home/Live screens rendered them verbatim, so a Greek or Georgian user
 * read "Chișinău" / "Mitropolia Moldovei". Attaching a translation key to each of
 * the 32 source entries would duplicate the same handful of place names, so the
 * mapping lives here, keyed by the canonical string used in the registry.
 *
 * Places whose conventional written form is already the local one (a Serbian city
 * in a Serbian-script locale, for example) intentionally have no entry: the
 * registry already carries the right text for them and we add no translation
 * churn. Consumers must always fall back to the raw value, never to a key.
 */
const LOCATION_KEYS: Record<string, TranslationKey> = {
  'București': 'location.bucharest',
  'Iași': 'location.iasi',
  'Cluj-Napoca': 'location.clujNapoca',
  'Chișinău': 'location.chisinau',
  'Salonic': 'location.thessaloniki',
  'Corfu': 'location.corfu',
  'Nicosia': 'location.nicosia',
  'Beograd': 'location.belgrade',
  'Kyiv': 'location.kyiv',
  'Moscow': 'location.moscow',
  'Minsk': 'location.minsk',
  'Sofia': 'location.sofia',
  'Skopje': 'location.skopje',
  'Tirana': 'location.tirana',
  'Tbilisi': 'location.tbilisi',
};

/**
 * Return the translation key for a registry location, or `null` when the place is
 * shown as-is. Callers must fall back to the raw string.
 */
export function locationTranslationKey(location: string): TranslationKey | null {
  return LOCATION_KEYS[location.trim()] ?? null;
}

/**
 * Resolve a registry location for display in the active language. Falls back to
 * the canonical string when the place has no translated name, so a missing key
 * can never render a raw lookup identifier.
 */
export function localizeLocation(
  location: string,
  t: (key: TranslationKey) => string,
): string {
  const key = locationTranslationKey(location);
  return key ? t(key) : location;
}
