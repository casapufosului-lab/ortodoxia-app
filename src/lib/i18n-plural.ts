/**
 * Plural selection, kept free of any application import so it can be unit-tested
 * directly by Node's test runner.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several keys interpolate a count (`{count}`, `{limit}`) and the surrounding noun
 * has to agree with it. Romanian needs "1 mesaj" but "5 mesaje"; Russian needs
 * "1 сообщение" but "5 сообщений". The app rendered a single form, so a remaining
 * count of 1 produced "1 din 5 mesaje rămase azi" — visibly wrong, and reachable
 * because the remaining AI messages decrement through 1.
 *
 * WHY NOT ICU
 * -----------
 * The dictionary is a flat record with a compile-time parity guard across 10 locales.
 * Adopting a full ICU message format would mean replacing the whole lookup layer.
 * Instead a locale defines at most one extra key per affected string, suffixed by the
 * CLDR plural category that differs from the default:
 *
 *   'some.key'      -> default wording, used for "other" and "many"
 *   'some.key#one'  -> used when Intl.PluralRules selects exactly "one"
 *   'some.key#few'  -> used when it selects exactly "few"
 *
 * `Intl.PluralRules` decides the category, so the grammar rule is not re-implemented
 * per language.
 */

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** Suffixes a locale may define. "many" and "other" intentionally share the base. */
export type PluralSuffix = 'one' | 'few';

/**
 * Plural category for `count`.
 *
 * `Intl.PluralRules` is available in Hermes with full ICU on Expo SDK 57. If it is
 * unavailable the function degrades to "other", which yields the default wording
 * rather than an untranslated key.
 */
export function pluralCategory(language: string, count: number): PluralCategory {
  try {
    return new Intl.PluralRules(language).select(count) as PluralCategory;
  } catch {
    return 'other';
  }
}

/** Suffix to try first, or null when the default wording applies. */
export function pluralSuffixFor(language: string, count: number): PluralSuffix | null {
  const category = pluralCategory(language, count);
  if (category === 'one') return 'one';
  if (category === 'few') return 'few';
  return null;
}

/**
 * Look up `key` with the plural form selected for `count`, then substitute the
 * supplied values.
 *
 * `lookup` must return `null` when the locale has no string for that exact key, so a
 * locale without a variant falls back to the base wording instead of rendering a raw
 * key.
 *
 * @param language BCP-47 language tag used for the CLDR rule.
 * @param baseKey  Key of the non-plural wording.
 * @param count    Value that decides the form.
 * @param lookup   Resolver for a key in this language, or null when absent.
 * @param values   Values substituted into `{placeholders}`.
 */
export function selectPluralForm(
  language: string,
  baseKey: string,
  count: number,
  lookup: (key: string) => string | null,
  values: Record<string, string | number> = {},
): string {
  const candidates: string[] = [];
  const suffix = pluralSuffixFor(language, count);
  if (suffix) candidates.push(`${baseKey}#${suffix}`);
  candidates.push(baseKey);

  let template: string | null = null;
  for (const candidate of candidates) {
    const resolved = lookup(candidate);
    if (resolved !== null) {
      template = resolved;
      break;
    }
  }

  // A completely missing base key must be visible, not silently blank.
  if (template === null) return baseKey;

  return template.replace(/\{([a-zA-Z_]+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}
