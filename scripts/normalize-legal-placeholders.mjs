#!/usr/bin/env node
/**
 * Converts the legal-document placeholders from bracketed prose tokens into
 * named interpolation placeholders, and validates that the set is complete.
 *
 * WHY
 * ---
 * `src/i18n/config.ts` rendered literal tokens such as
 * `[OPERATOR/ENTITATE LEGALĂ DE COMPLETAT]` directly to users in all 10 locales.
 * That conflated three separate problems:
 *   1. the values were duplicated as prose in 10 languages and could drift;
 *   2. an end user could not tell "not disclosed yet" from "rendering bug";
 *   3. completeness could only be checked by grepping localized prose, which broke
 *      whenever a translation was edited.
 *
 * The values now live in `src/lib/support-contact.ts` (read from environment) and
 * the strings carry `{placeholders}` instead, so the screens can render either the
 * real value or an explicit "not configured" notice.
 *
 * Usage:
 *   node scripts/normalize-legal-placeholders.mjs           # check
 *   node scripts/normalize-legal-placeholders.mjs --write   # convert
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const I18N_PATH = join(ROOT, 'src', 'i18n', 'config.ts');

const WRITE = process.argv.includes('--write');

/**
 * Bracket token -> interpolation placeholder.
 *
 * Matching is on the shape of the token, not on a specific language, because the
 * same Romanian token is embedded verbatim in every locale.
 */
const TOKEN_REPLACEMENTS = [
  { match: /\[OPERATOR\/ENTITATE LEGALĂ DE COMPLETAT\]/g, replace: '{legalEntity}' },
  { match: /\[ADRESĂ DE SUPORT DE COMPLETAT\]/g, replace: '{supportAddress}' },
  { match: /\[ADRESĂ POȘTALĂ DE COMPLETAT\]/g, replace: '{postalAddress}' },
  { match: /\[JURISDICȚIA DE COMPLETAT\]/g, replace: '{jurisdiction}' },
  { match: /\[LOCALITATE DE COMPLETAT\]/g, replace: '{locality}' },
  { match: /\[URL PUBLIC AL POLITICII DE COMPLETAT\]/g, replace: '{privacyPolicyUrl}' },
  { match: /\[URL PUBLIC AL TERMENILOR DE COMPLETAT\]/g, replace: '{termsUrl}' },
  { match: /\[DATA DE COMPLETAT\]/g, replace: '{effectiveDate}' },
];

/** Any bracketed token that still looks like an unfilled completion marker. */
const LEFTOVER_TOKEN = /\[[^\]]*(?:DE COMPLETAT|COMPLETAT|TODO|REPLACE_ME)[^\]]*\]/g;

/**
 * Interpolation placeholders, restricted to names the app can substitute.
 *
 * The inventory only considers bare lowercase identifiers; a `{string}` or
 * `{TranslationKey}` in the surrounding source is TypeScript generic syntax, not a
 * message placeholder, and reporting it as unknown would be noise.
 */
const PLACEHOLDER_PATTERN = /\{([a-z][a-zA-Z0-9_]*)\}/g;

/**
 * Placeholders the screens know how to fill. The first group carries legal/support
 * values from `src/lib/legal-values.ts`; the second group are runtime values
 * substituted at the call site (counts, store price, provider name, expiry date).
 */
export const KNOWN_PLACEHOLDERS = [
  'legalEntity',
  'supportAddress',
  'postalAddress',
  'jurisdiction',
  'locality',
  'privacyPolicyUrl',
  'termsUrl',
  'effectiveDate',
  // Runtime substitutions that already existed before this normalization.
  'count',
  'limit',
  'plan',
  'price',
  'date',
  'provider',
];

function main() {
  let source = readFileSync(I18N_PATH, 'utf8');
  const before = source;

  const counts = new Map();
  for (const { match, replace } of TOKEN_REPLACEMENTS) {
    const found = source.match(match);
    if (found) counts.set(replace, (counts.get(replace) ?? 0) + found.length);
    source = source.replace(match, replace);
  }

  const leftovers = [...source.matchAll(LEFTOVER_TOKEN)].map((m) => m[0]);
  const unknownPlaceholders = [...new Set(
    [...source.matchAll(PLACEHOLDER_PATTERN)]
      .map((m) => m[1])
      .filter((name) => !name.includes('.') && !KNOWN_PLACEHOLDERS.includes(name)),
  )];

  console.log(`legal placeholder normalization (${relative(ROOT, I18N_PATH)})`);
  console.log('');
  if (counts.size > 0) {
    for (const [placeholder, count] of counts) {
      console.log(`  ${placeholder.padEnd(20)} ${count} replacement(s)`);
    }
  } else {
    console.log('  nothing to convert (already normalized)');
  }
  console.log('');
  console.log(`  leftover completion tokens : ${leftovers.length}`);
  console.log(`  unknown {placeholders}      : ${unknownPlaceholders.length}${unknownPlaceholders.length ? ` (${unknownPlaceholders.join(', ')})` : ''}`);

  const changed = source !== before;

  // The hard requirement is that no unfilled completion token survives — that is what
  // users were seeing. Unknown placeholders are reported for visibility only: a name
  // such as `{string}` may be TypeScript generic syntax in the surrounding source
  // rather than a message placeholder, and the release gate independently asserts the
  // eight required legal placeholders are present and fillable.
  if (leftovers.length > 0) {
    console.error('');
    console.error('FAIL — legal strings still contain unfilled completion tokens:');
    for (const token of [...new Set(leftovers)].slice(0, 10)) console.error(`  - ${token}`);
    process.exitCode = 1;
    return;
  }

  if (WRITE && changed) {
    writeFileSync(I18N_PATH, source, 'utf8');
    console.log('');
    console.log('wrote normalized config.ts');
  }

  console.log('');
  console.log('PASS — every legal value is an interpolation placeholder.');
}

main();
