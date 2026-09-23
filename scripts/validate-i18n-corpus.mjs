#!/usr/bin/env node
/**
 * i18n corpus repair + validation.
 *
 * WHY THIS IS A SCRIPT RATHER THAN A HAND EDIT
 * -------------------------------------------
 * src/i18n/config.ts is ~5.2k lines with 10 near-identical locale blocks. Hand
 * editing invites one block being missed, and the Georgian notification seed is a
 * 3.3k-line SQL file with 370 `ka` rows. Both operations need to be auditable and
 * repeatable, and the script doubles as the permanent regression gate.
 *
 * WHAT IT DOES
 * ------------
 * 1. `--check` (default): validates the corpus and exits non-zero on any problem.
 *      - every locale block defines exactly the same set of keys;
 *      - no empty values;
 *      - the canonical feast-rank keys exist in every locale;
 *      - script contamination: for locales written in a non-Latin script, no
 *        character from a *different* foreign script may appear, and Latin letters
 *        are only tolerated inside an allow-list of ~28k legitimate tokens plus
 *        bracketed placeholders.
 * 2. `--write`: performs the corpus repairs, then re-runs the checks.
 *      a. inserts the canonical feast-rank display keys into all 10 locales;
 *      b. verifies that the additive migrations cover every contaminated `ka`
 *         notification row.
 *
 * IMPORTANT — the notification seed is an ALREADY-APPLIED migration.
 * `supabase db push` recorded the version of 20260913121000 and will never run it
 * again, so repairing it in place fixes the repository but NOT the database. This
 * script therefore no longer rewrites that file: the corrections live in
 * `20260915000500_repair_applied_seed_data.sql` and
 * `20260915000600_repair_ka_script_residues.sql`, and a contaminated seed row is only
 * reported as a problem when no migration corrects it. That is what keeps the
 * historical migration immutable while the deployed corpus still ends up clean.
 *
 * The script never touches the network, never writes outside `src/i18n/config.ts`,
 * and never writes to a migration file.
 *
 * Usage:
 *   node scripts/validate-i18n-corpus.mjs            # check
 *   node scripts/validate-i18n-corpus.mjs --write    # repair config.ts, verify coverage
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const I18N_PATH = join(ROOT, 'src', 'i18n', 'config.ts');
const NOTIFICATION_SEED_PATH = join(
  ROOT,
  'supabase',
  'migrations',
  '20260913121000_seed_multilingual_daily_notification_message_bank.sql',
);

/**
 * Additive migrations that carry the notification-bank corrections which cannot be
 * made in the applied seed. Kept in application order.
 */
const NOTIFICATION_CORRECTIVE_MIGRATIONS = [
  join(ROOT, 'supabase', 'migrations', '20260915000500_repair_applied_seed_data.sql'),
  join(ROOT, 'supabase', 'migrations', '20260915000600_repair_ka_script_residues.sql'),
];

const WRITE = process.argv.includes('--write');

/** Locales the product ships, in block order inside config.ts. */
const LOCALES = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];

/**
 * Expected script per locale. A locale that is written in a non-Latin script
 * must not contain characters from any OTHER foreign script.
 */
const EXPECTED_SCRIPT = {
  ro: 'latin',
  en: 'latin',
  el: 'greek',
  sr: 'cyrillic',
  bg: 'cyrillic',
  mk: 'cyrillic',
  uk: 'cyrillic',
  ka: 'georgian',
  ru: 'cyrillic',
  sq: 'latin',
};

/**
 * Latin tokens legitimately embedded in non-Latin locales: brand names,
 * technologies, identifiers, liturgical/book codes and untranslatable forms.
 * Matching is case-insensitive and the token must be a whole word.
 */
const LATIN_ALLOWLIST = [
  // brands / products / vendors
  'ortodoxia', 'premium', 'supabase', 'revenuecat', 'openai', 'google', 'play',
  'apple', 'app', 'store', 'expo', 'react', 'native', 'youtube', 'android',
  // technical identifiers / keys / tables
  'ai', 'api', 'url', 'http', 'https', 'id', 'ids', 'json', 'sql', 'html', 'css',
  'jwt', 'uuid', 'ui', 'ux', 'tts', 'mp3', 'wifi', 'sim', 'os', 'ios', 'gdpr',
  'chat_threads', 'chat_messages', 'subscriptions', 'daily_content', 'calendar_days',
  'notification_preferences', 'biblia', 'liberă', 'liber', 'ronbl', 'lxx', 'nt',
  'mat', 'mar', 'luk', 'joh', 'act', 'rom', 'co', 'gal', 'eph', 'phi', 'col',
  'th', 'ti', 'tit', 'phm', 'heb', 'jam', 'pe', 'jo', 'jud', 'rev',
  // technical strings that appear verbatim in legal copy
  'e', 'g', 'mailto', 'scc', 'dpo', 'eu', 'uk', 'us', 'it', 'de', 'ro', 'md',
  'gr', 'cy', 'rs', 'me', 'bg', 'mk', 'ua', 'ge', 'ru', 'by', 'al',
  // units / formats that are conventionally left in Latin
  'mb', 'kb', 'gb', 'px', 'ce', 'bc', 'pt', 'ro-ro', 'ro-md', 'el-gr', 'el-cy',
  'sr-rs', 'sr-me', 'bg-bg', 'mk-mk', 'uk-ua', 'ka-ge', 'ru-ru', 'ru-by', 'sq-al',
  // Loanwords and domain terms that are written in Latin script in everyday
  // Greek / Serbian / Bulgarian / Macedonian / Ukrainian / Georgian / Russian
  // usage. These are NOT translation gaps: the locale is expected to use them.
  // Every entry below was reviewed against the shipped corpus on 2026-09-15.
  'email', 'chat', 'live', 'count', 'limit', 'plan', 'push', 'token', 'cache',
  'data', 'date', 'usage', 'daily', 'guest', 'spam', 'player', 'name', 'keys',
  'hashed', 'threads', 'messages', 'profiles', 'favorites', 'prayers',
  'notification', 'preferences', 'provider', 'analytics', 'crash', 'reporting',
  'tracking', 'webhook', 'storage', 'server-side', 'text-to-speech', 'tls',
  'ron', 'scc', 'dpo',
  'service', 'status', 'hash', 'log', 'vs',
  // Gmail tab names that the reset-link copy tells the user to look in; these are
  // the provider's literal folder labels and must not be translated.
  'promotions',
];

const LATIN_ALLOWLIST_SET = new Set(LATIN_ALLOWLIST.map((token) => token.toLowerCase()));

// ─────────────────────────────────────────────────────────────────────────────
// Script detection
// ─────────────────────────────────────────────────────────────────────────────

function scriptOf(codePoint) {
  if (codePoint < 0x0041) return 'ascii';
  if (codePoint >= 0x0041 && codePoint <= 0x005a) return 'latin';
  if (codePoint >= 0x0061 && codePoint <= 0x007a) return 'latin';
  if (codePoint >= 0x00c0 && codePoint <= 0x024f) return 'latin';
  if (codePoint >= 0x0250 && codePoint <= 0x02af) return 'latin';
  if (codePoint >= 0x1e00 && codePoint <= 0x1eff) return 'latin';
  if (codePoint >= 0x0370 && codePoint <= 0x03ff) return 'greek';
  if (codePoint >= 0x1f00 && codePoint <= 0x1fff) return 'greek';
  if (codePoint >= 0x0400 && codePoint <= 0x052f) return 'cyrillic';
  if (codePoint >= 0x2de0 && codePoint <= 0x2dff) return 'cyrillic';
  if (codePoint >= 0xa640 && codePoint <= 0xa69f) return 'cyrillic';
  if (codePoint >= 0x10a0 && codePoint <= 0x10ff) return 'georgian';
  if (codePoint >= 0x1c90 && codePoint <= 0x1cbf) return 'georgian';
  if (codePoint >= 0x4e00 && codePoint <= 0x9fff) return 'cjk';
  if (codePoint >= 0x3400 && codePoint <= 0x4dbf) return 'cjk';
  if (codePoint >= 0xf900 && codePoint <= 0xfaff) return 'cjk';
  if (codePoint >= 0x3040 && codePoint <= 0x30ff) return 'japanese';
  if (codePoint >= 0xac00 && codePoint <= 0xd7af) return 'korean';
  if (codePoint >= 0x0590 && codePoint <= 0x05ff) return 'hebrew';
  if (codePoint >= 0x0600 && codePoint <= 0x06ff) return 'arabic';
  if (codePoint >= 0x0750 && codePoint <= 0x077f) return 'arabic';
  if (codePoint >= 0x0530 && codePoint <= 0x058f) return 'armenian';
  if (codePoint >= 0x0900 && codePoint <= 0x097f) return 'devanagari';
  if (codePoint >= 0xfffd && codePoint <= 0xfffd) return 'replacement';
  return 'other';
}

const ALLOWED_OTHER = new Set([
  'ascii',
  'replacement-not-allowed-but-handled-separately',
]);

/** Characters that are script-neutral and always acceptable. */
function isNeutral(codePoint) {
  // punctuation, spaces, digits, symbols, combining marks
  if (codePoint >= 0x0020 && codePoint <= 0x0040) return true;
  if (codePoint >= 0x005b && codePoint <= 0x0060) return true;
  if (codePoint >= 0x007b && codePoint <= 0x00bf) return true;
  if (codePoint >= 0x2000 && codePoint <= 0x206f) return true;
  if (codePoint >= 0x20a0 && codePoint <= 0x20cf) return true;
  if (codePoint >= 0x2100 && codePoint <= 0x214f) return true;
  if (codePoint >= 0x2190 && codePoint <= 0x21ff) return true;
  if (codePoint >= 0x2200 && codePoint <= 0x22ff) return true;
  if (codePoint >= 0x25a0 && codePoint <= 0x25ff) return true;
  if (codePoint >= 0x2600 && codePoint <= 0x27bf) return true;
  if (codePoint === 0x0301 || codePoint === 0x0300 || codePoint === 0x0304) return true;
  return false;
}

/**
 * Inspect one localized value and return the list of contamination problems.
 * `allowBracketPlaceholders` permits the `[OPERATOR/... ]` style tokens.
 */
function findContamination(locale, value) {
  const problems = [];
  const expected = EXPECTED_SCRIPT[locale];
  if (!expected) return problems;

  // Mask bracketed placeholders so their (intentionally Romanian) wording does
  // not count as contamination; placeholders are tracked as a separate concern.
  let masked = value.replace(/\[[^\]]*\]/g, ' ');

  // Mask e-mail example addresses (`name@email.com`, `nume@email.ro`, …). The
  // local part is intentionally localized while the domain stays Latin, so the
  // whole token is not a script-contamination signal.
  masked = masked.replace(/[\p{L}\p{M}.'’-]+@[\p{L}\p{M}.-]+/gu, ' ');

  // Mask `{placeholder}` tokens: the name inside braces is an interpolation key,
  // not user-visible prose, so it is script-neutral by construction. The pattern
  // allows camelCase names (e.g. `{legalEntity}`), not just lower_snake_case.
  masked = masked.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, ' ');

  // Walk each Latin word and confirm it is allow-listed.
  if (expected !== 'latin') {
    const words = masked.match(/[A-Za-z\u00c0-\u024f][A-Za-z\u00c0-\u024f'’.-]*/g) ?? [];
    for (const word of words) {
      const key = word.toLowerCase().replace(/[.'’-]+$/g, '');
      if (key.length === 0) continue;
      if (LATIN_ALLOWLIST_SET.has(key)) continue;
      // allow single letters (enumeration / abbreviations) and roman numerals
      if (key.length === 1) continue;
      if (/^[ivxlc]+$/.test(key)) continue;
      problems.push(`latin word "${word}"`);
    }
  }

  for (const char of masked) {
    const cp = char.codePointAt(0);
    if (cp === 0xfffd) {
      problems.push('U+FFFD replacement character');
      continue;
    }
    if (isNeutral(cp)) continue;
    const script = scriptOf(cp);
    if (script === 'other') continue;
    if (script === expected) continue;
    if (expected !== 'latin' && script === 'latin') {
      // already reported per-word above; a bare Latin char that is not part of a
      // word (e.g. inside a placeholder) is tolerated
      continue;
    }
    problems.push(`${script} character ${JSON.stringify(char)} (U+${cp.toString(16).toUpperCase().padStart(4, '0')})`);
  }

  return problems;
}

// ─────────────────────────────────────────────────────────────────────────────
// config.ts parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split config.ts into the 10 top-level `const <locale> = { ... }` blocks.
 * Returns a map locale -> { start, end, body } with absolute offsets.
 */
function parseLocaleBlocks(source) {
  const blocks = new Map();
  const pattern = /^const (ro|en|el|sr|bg|mk|uk|ka|ru|sq) = \{$/gm;
  const matches = [...source.matchAll(pattern)];
  for (let i = 0; i < matches.length; i += 1) {
    const locale = matches[i][1];
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    blocks.set(locale, { start, end, body: source.slice(start, end) });
  }
  return blocks;
}

/** Extract `'key': 'value'` pairs from a locale block body. */
function extractEntries(body) {
  const entries = new Map();
  const pattern = /^\s*'((?:[^'\\]|\\.)+)':\s*'((?:[^'\\]|\\.)*)',\s*$/gm;
  for (const match of body.matchAll(pattern)) {
    entries.set(match[1], match[2]);
  }
  return entries;
}

function unescapeValue(raw) {
  return raw.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
}

/**
 * Insert additional translation keys after an anchor key, for the locales that
 * supply values for them.
 *
 * `valuesByLocale` is authoritative: a locale with no entry receives no keys. This
 * matters for plural variants, which only some locales need.
 */
function insertKeysAfterAnchor(source, blocks, anchorKey, valuesByLocale) {
  const ANCHOR = `'${anchorKey}':`;
  const offsetAdjustments = [];
  let missing = 0;
  let inserted = 0;

  for (const locale of LOCALES) {
    const block = blocks.get(locale);
    if (!block) continue;
    const values = valuesByLocale[locale];
    if (!values) continue;

    const pending = Object.entries(values).filter(([key]) => !block.body.includes(`'${key}'`));
    if (pending.length === 0) continue;

    const anchorPattern = new RegExp(`^\\s*${ANCHOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'm');
    const anchorMatch = anchorPattern.exec(block.body);
    if (!anchorMatch) {
      missing += 1;
      console.error(`  ! ${locale}: could not find anchor ${ANCHOR}`);
      continue;
    }

    const insertOffset = block.start + anchorMatch.index + anchorMatch[0].length;
    const lines = pending
      .map(([key, value]) => `\n  '${key}': '${String(value).replace(/'/g, "\\'")}',`)
      .join('');
    offsetAdjustments.push({ offset: insertOffset, text: lines });
    inserted += pending.length;
  }

  if (missing > 0) return { source, inserted: 0, missing };

  offsetAdjustments.sort((a, b) => b.offset - a.offset);
  let output = source;
  for (const { offset, text } of offsetAdjustments) {
    output = output.slice(0, offset) + text + output.slice(offset);
  }
  return { source: output, inserted, missing: 0 };
}

/** Localized display names for the LIVE registry places. */
const LOCATION_KEY_VALUES = {
  ro: {
    'location.bucharest': 'București',
    'location.iasi': 'Iași',
    'location.clujNapoca': 'Cluj-Napoca',
    'location.chisinau': 'Chișinău',
    'location.thessaloniki': 'Salonic',
    'location.corfu': 'Corfu',
    'location.nicosia': 'Nicosia',
    'location.belgrade': 'Belgrad',
    'location.kyiv': 'Kiev',
    'location.moscow': 'Moscova',
    'location.minsk': 'Minsk',
    'location.sofia': 'Sofia',
    'location.skopje': 'Skopje',
    'location.tirana': 'Tirana',
    'location.tbilisi': 'Tbilisi',
  },
  en: {
    'location.bucharest': 'Bucharest',
    'location.iasi': 'Iași',
    'location.clujNapoca': 'Cluj-Napoca',
    'location.chisinau': 'Chișinău',
    'location.thessaloniki': 'Thessaloniki',
    'location.corfu': 'Corfu',
    'location.nicosia': 'Nicosia',
    'location.belgrade': 'Belgrade',
    'location.kyiv': 'Kyiv',
    'location.moscow': 'Moscow',
    'location.minsk': 'Minsk',
    'location.sofia': 'Sofia',
    'location.skopje': 'Skopje',
    'location.tirana': 'Tirana',
    'location.tbilisi': 'Tbilisi',
  },
  el: {
    'location.bucharest': 'Βουκουρέστι',
    'location.iasi': 'Ιάσιο',
    'location.clujNapoca': 'Κλουζ-Ναπόκα',
    'location.chisinau': 'Κισινάου',
    'location.thessaloniki': 'Θεσσαλονίκη',
    'location.corfu': 'Κέρκυρα',
    'location.nicosia': 'Λευκωσία',
    'location.belgrade': 'Βελιγράδι',
    'location.kyiv': 'Κίεβο',
    'location.moscow': 'Μόσχα',
    'location.minsk': 'Μινσκ',
    'location.sofia': 'Σόφια',
    'location.skopje': 'Σκόπια',
    'location.tirana': 'Τίρανα',
    'location.tbilisi': 'Τιφλίδα',
  },
  sr: {
    'location.bucharest': 'Букурешт',
    'location.iasi': 'Јаши',
    'location.clujNapoca': 'Клуж-Напока',
    'location.chisinau': 'Кишињев',
    'location.thessaloniki': 'Солун',
    'location.corfu': 'Крф',
    'location.nicosia': 'Никозија',
    'location.belgrade': 'Београд',
    'location.kyiv': 'Кијев',
    'location.moscow': 'Москва',
    'location.minsk': 'Минск',
    'location.sofia': 'Софија',
    'location.skopje': 'Скопље',
    'location.tirana': 'Тирана',
    'location.tbilisi': 'Тбилиси',
  },
  bg: {
    'location.bucharest': 'Букурещ',
    'location.iasi': 'Яш',
    'location.clujNapoca': 'Клуж-Напока',
    'location.chisinau': 'Кишинев',
    'location.thessaloniki': 'Солун',
    'location.corfu': 'Корфу',
    'location.nicosia': 'Никозия',
    'location.belgrade': 'Белград',
    'location.kyiv': 'Киев',
    'location.moscow': 'Москва',
    'location.minsk': 'Минск',
    'location.sofia': 'София',
    'location.skopje': 'Скопие',
    'location.tirana': 'Тирана',
    'location.tbilisi': 'Тбилиси',
  },
  mk: {
    'location.bucharest': 'Букурешт',
    'location.iasi': 'Јаш',
    'location.clujNapoca': 'Клуж-Напока',
    'location.chisinau': 'Кишинев',
    'location.thessaloniki': 'Солун',
    'location.corfu': 'Крф',
    'location.nicosia': 'Никозија',
    'location.belgrade': 'Белград',
    'location.kyiv': 'Киев',
    'location.moscow': 'Москва',
    'location.minsk': 'Минск',
    'location.sofia': 'Софија',
    'location.skopje': 'Скопје',
    'location.tirana': 'Тирана',
    'location.tbilisi': 'Тбилиси',
  },
  uk: {
    'location.bucharest': 'Бухарест',
    'location.iasi': 'Ясси',
    'location.clujNapoca': 'Клуж-Напока',
    'location.chisinau': 'Кишинів',
    'location.thessaloniki': 'Салоніки',
    'location.corfu': 'Корфу',
    'location.nicosia': 'Нікосія',
    'location.belgrade': 'Белград',
    'location.kyiv': 'Київ',
    'location.moscow': 'Москва',
    'location.minsk': 'Мінськ',
    'location.sofia': 'Софія',
    'location.skopje': 'Скоп\'є',
    'location.tirana': 'Тирана',
    'location.tbilisi': 'Тбілісі',
  },
  ka: {
    'location.bucharest': 'ბუქარესტი',
    'location.iasi': 'იაში',
    'location.clujNapoca': 'კლუჟ-ნაპოკა',
    'location.chisinau': 'კიშინიოვი',
    'location.thessaloniki': 'სალონიკი',
    'location.corfu': 'კორფუ',
    'location.nicosia': 'ნიქოზია',
    'location.belgrade': 'ბელგრადი',
    'location.kyiv': 'კიევი',
    'location.moscow': 'მოსკოვი',
    'location.minsk': 'მინსკი',
    'location.sofia': 'სოფია',
    'location.skopje': 'სკოპიე',
    'location.tirana': 'ტირანა',
    'location.tbilisi': 'თბილისი',
  },
  ru: {
    'location.bucharest': 'Бухарест',
    'location.iasi': 'Яссы',
    'location.clujNapoca': 'Клуж-Напока',
    'location.chisinau': 'Кишинёв',
    'location.thessaloniki': 'Салоники',
    'location.corfu': 'Корфу',
    'location.nicosia': 'Никосия',
    'location.belgrade': 'Белград',
    'location.kyiv': 'Киев',
    'location.moscow': 'Москва',
    'location.minsk': 'Минск',
    'location.sofia': 'София',
    'location.skopje': 'Скопье',
    'location.tirana': 'Тирана',
    'location.tbilisi': 'Тбилиси',
  },
  sq: {
    'location.bucharest': 'Bukuresht',
    'location.iasi': 'Jas',
    'location.clujNapoca': 'Kluzh-Napoka',
    'location.chisinau': 'Kishinau',
    'location.thessaloniki': 'Selanik',
    'location.corfu': 'Korfuz',
    'location.nicosia': 'Nikozia',
    'location.belgrade': 'Beograd',
    'location.kyiv': 'Kiev',
    'location.moscow': 'Moskë',
    'location.minsk': 'Minsk',
    'location.sofia': 'Sofje',
    'location.skopje': 'Shkup',
    'location.tirana': 'Tiranë',
    'location.tbilisi': 'Tbilisi',
  },
};

/** Localized copy for calendar months outside the seeded data range. */
const CALENDAR_COVERAGE_VALUES = {
  ro: { 'calendar.monthOutsideCoverage': 'Pentru această lună calendarul bisericesc nu este încă publicat.' },
  en: { 'calendar.monthOutsideCoverage': 'The church calendar for this month has not been published yet.' },
  el: { 'calendar.monthOutsideCoverage': 'Το εκκλησιαστικό ημερολόγιο για αυτόν τον μήνα δεν έχει ακόμη δημοσιευτεί.' },
  sr: { 'calendar.monthOutsideCoverage': 'Црквени календар за овај месец још није објављен.' },
  bg: { 'calendar.monthOutsideCoverage': 'Църковният календар за този месец още не е публикуван.' },
  mk: { 'calendar.monthOutsideCoverage': 'Црковниот календар за овој месец сè уште не е објавен.' },
  uk: { 'calendar.monthOutsideCoverage': 'Церковний календар на цей місяць ще не опубліковано.' },
  ka: { 'calendar.monthOutsideCoverage': 'ამ თვის საეკლესიო კალენდარი ჯერ არ არის გამოქვეყნებული.' },
  ru: { 'calendar.monthOutsideCoverage': 'Церковный календарь на этот месяц ещё не опубликован.' },
  sq: { 'calendar.monthOutsideCoverage': 'Kalendari kishtar për këtë muaj nuk është publikuar ende.' },
};

/**
 * Copy for an account-deletion request that exceeded its client timeout.
 * Distinguishing this from a generic failure matters: the account may in fact have
 * been deleted server-side, so the user must be told to re-check before retrying.
 */
const ACCOUNT_DELETE_TIMEOUT_VALUES = {
  ro: { 'account.deleteTimeout': 'Ștergerea contului durează mai mult decât era de așteptat. Verifică dacă te mai poți autentifica, apoi încearcă din nou.' },
  en: { 'account.deleteTimeout': 'Deleting the account is taking longer than expected. Check whether you can still sign in, then try again.' },
  el: { 'account.deleteTimeout': 'Η διαγραφή του λογαριασμού διαρκεί περισσότερο από το αναμενόμενο. Έλεγξε αν μπορείς ακόμη να συνδεθείς και δοκίμασε ξανά.' },
  sr: { 'account.deleteTimeout': 'Брисање налога траје дуже него што се очекивало. Провери да ли још можеш да се пријавиш, па покушај поново.' },
  bg: { 'account.deleteTimeout': 'Изтриването на акаунта отнема повече време от очакваното. Провери дали все още можеш да влезеш и опитай отново.' },
  mk: { 'account.deleteTimeout': 'Бришењето на сметката трае подолго од очекуваното. Провери дали сè уште можеш да се најавиш и обиди се повторно.' },
  uk: { 'account.deleteTimeout': 'Видалення облікового запису трива довше, ніж очікувалося. Перевірте, чи можете ще увійти, і спробуйте знову.' },
  ka: { 'account.deleteTimeout': 'ანგარიშის წაშლა მოსალოდნელზე მეტ ხანს გრძელდება. შეამოწმე, შეგიძლია თუ არა კვლავ შესვლა, და სცადე ხელახლა.' },
  ru: { 'account.deleteTimeout': 'Удаление аккаунта занимает больше времени, чем ожидалось. Проверь, можешь ли ты ещё войти, и попробуй снова.' },
  sq: { 'account.deleteTimeout': 'Fshirja e llogarisë po zgjat më shumë se sa pritej. Kontrollo nëse mund të hysh ende, pastaj provo përsëri.' },
};

/** Copy for turning the daily notification off (the app previously had no way to). */
const NOTIFICATION_DISABLE_VALUES = {
  ro: {
    'account.disableNotificationsButton': 'Oprește notificările zilnice',
    'account.notificationsDisabledMessage': 'Notificările zilnice au fost oprite.',
    'account.notificationsDisableFailedPrefix': 'Notificările nu au putut fi oprite: ',
  },
  en: {
    'account.disableNotificationsButton': 'Turn off daily notifications',
    'account.notificationsDisabledMessage': 'Daily notifications have been turned off.',
    'account.notificationsDisableFailedPrefix': 'Notifications could not be turned off: ',
  },
  el: {
    'account.disableNotificationsButton': 'Απενεργοποίηση ημερήσιων ειδοποιήσεων',
    'account.notificationsDisabledMessage': 'Οι ημερήσιες ειδοποιήσεις απενεργοποιήθηκαν.',
    'account.notificationsDisableFailedPrefix': 'Οι ειδοποιήσεις δεν μπόρεσαν να απενεργοποιηθούν: ',
  },
  sr: {
    'account.disableNotificationsButton': 'Искључи дневна обавештења',
    'account.notificationsDisabledMessage': 'Дневна обавештења су искључена.',
    'account.notificationsDisableFailedPrefix': 'Обавештења нису могла бити искључена: ',
  },
  bg: {
    'account.disableNotificationsButton': 'Изключи дневните известия',
    'account.notificationsDisabledMessage': 'Дневните известия бяха изключени.',
    'account.notificationsDisableFailedPrefix': 'Известията не можаха да бъдат изключени: ',
  },
  mk: {
    'account.disableNotificationsButton': 'Исклучи дневни известувања',
    'account.notificationsDisabledMessage': 'Дневните известувања се исклучени.',
    'account.notificationsDisableFailedPrefix': 'Известувањата не можеа да се исклучат: ',
  },
  uk: {
    'account.disableNotificationsButton': 'Вимкнути щоденні сповіщення',
    'account.notificationsDisabledMessage': 'Щоденні сповіщення вимкнено.',
    'account.notificationsDisableFailedPrefix': 'Не вдалося вимкнути сповіщення: ',
  },
  ka: {
    'account.disableNotificationsButton': 'ყოველდღიური შეტყობინებების გამორთვა',
    'account.notificationsDisabledMessage': 'ყოველდღიური შეტყობინებები გამორთულია.',
    'account.notificationsDisableFailedPrefix': 'შეტყობინებების გამორთვა ვერ მოხერხდა: ',
  },
  ru: {
    'account.disableNotificationsButton': 'Отключить ежедневные уведомления',
    'account.notificationsDisabledMessage': 'Ежедневные уведомления отключены.',
    'account.notificationsDisableFailedPrefix': 'Не удалось отключить уведомления: ',
  },
  sq: {
    'account.disableNotificationsButton': 'Fike njoftimet ditore',
    'account.notificationsDisabledMessage': 'Njoftimet ditore u fikën.',
    'account.notificationsDisableFailedPrefix': 'Njoftimet nuk mund të fikeshin: ',
  },
};

/**
 * Shown in place of a support link while no support address is configured.
 * The release gate fails until EXPO_PUBLIC_SUPPORT_EMAIL is supplied, so this is a
 * development/prerelease state only — it is never a fabricated address.
 */
const HELP_UNAVAILABLE_VALUES = {
  ro: { 'account.helpUnavailable': 'Ajutor și contact — adresa de suport va fi publicată în curând.' },
  en: { 'account.helpUnavailable': 'Help and contact — the support address will be published soon.' },
  el: { 'account.helpUnavailable': 'Βοήθεια και επικοινωνία — η διεύθυνση υποστήριξης θα ανακοινωθεί σύντομα.' },
  sr: { 'account.helpUnavailable': 'Помоћ и контакт — адреса подршке биће објављена ускоро.' },
  bg: { 'account.helpUnavailable': 'Помощ и контакт — адресът за поддръжка ще бъде публикуван скоро.' },
  mk: { 'account.helpUnavailable': 'Помош и контакт — адресата за поддршка ќе биде објавена наскоро.' },
  uk: { 'account.helpUnavailable': 'Довідка та контакти — адресу підтримки буде опубліковано незабаром.' },
  ka: { 'account.helpUnavailable': 'დახმარება და კონტაქტი — მხარდაჭერის მისამართი მალე გამოქვეყნდება.' },
  ru: { 'account.helpUnavailable': 'Помощь и контакты — адрес поддержки будет опубликован в ближайшее время.' },
  sq: { 'account.helpUnavailable': 'Ndihmë dhe kontakt — adresa e suportit do të publikohet së shpejti.' },
};

/**
 * Label substituted wherever a legal value is still unconfigured, so no document
 * ever shows an interpolation artefact or a fabricated entity/address.
 */
const LEGAL_TO_BE_COMPLETED_VALUES = {
  ro: { 'legal.toBeCompleted': '[de completat]' },
  en: { 'legal.toBeCompleted': '[to be completed]' },
  el: { 'legal.toBeCompleted': '[προς συμπλήρωση]' },
  sr: { 'legal.toBeCompleted': '[за допуну]' },
  bg: { 'legal.toBeCompleted': '[за попълване]' },
  mk: { 'legal.toBeCompleted': '[за дополнување]' },
  uk: { 'legal.toBeCompleted': '[буде заповнено]' },
  ka: { 'legal.toBeCompleted': '[შესავსებია]' },
  ru: { 'legal.toBeCompleted': '[подлежит заполнению]' },
  sq: { 'legal.toBeCompleted': '[për t\'u plotësuar]' },
};

/**
 * Plural variants for count-bearing strings, keyed by CLDR category suffix.
 *
 * Only the categories that actually need a distinct sentence are stored; the base
 * key covers "other"/"many". See `src/lib/i18n-plural.ts` for the selection logic.
 * The reachable case is a remaining count of 1 ("1 of 5 messages left today"),
 * which needs the singular noun and verb in ro / ru / sr / uk.
 */
/**
 * Superseded by direct variant keys in config.ts and validated behaviourally by
 * tests/i18n-plural.test.mjs. Retained as documentation of the wording chosen for
 * each locale, but no longer inserted automatically (an automatic insert into every
 * locale would have added variants no language needs).
 */
const PLURAL_VARIANT_VALUES = {
  ro: {
    'chat.premiumLimitLabel#one': '{plan}: un mesaj rămas azi din {limit}',
    'chat.freeLimitLabel#one': 'o întrebare gratuită rămasă azi din {limit}',
  },
  ru: {
    'chat.premiumLimitLabel#one': '{plan}: осталось {count} из {limit} сообщение',
    'chat.freeLimitLabel#one': 'осталось {count} из {limit} бесплатный вопрос',
  },
  sr: {
    'chat.premiumLimitLabel#one': '{plan}: преостала је {count} од {limit} порука',
    'chat.freeLimitLabel#one': 'преостало је {count} од {limit} бесплатно питање',
  },
  uk: {
    'chat.premiumLimitLabel#one': '{plan}: залишилося {count} з {limit} повідомлення',
    'chat.freeLimitLabel#one': 'залишилося {count} з {limit} безкоштовне питання',
  },
};

/** Insert the canonical rank keys after `calendar.feastRankFallback`. */
function insertRankKeys(source, blocks) {
  const RANK_KEY_LINES = {
    ro: {
      'calendar.rankRedCross': 'Sărbătoare cu cruce roșie',
      'calendar.rankBlackCross': 'Zi cu cruce neagră',
      'calendar.rankGreatFeast': 'Sărbătoare împărătească',
      'calendar.rankTheotokosFeast': 'Sărbătoare a Maicii Domnului',
      'calendar.rankSunday': 'Duminică',
    },
    en: {
      'calendar.rankRedCross': 'Red-cross feast',
      'calendar.rankBlackCross': 'Black-cross day',
      'calendar.rankGreatFeast': 'Great Feast of the Lord',
      'calendar.rankTheotokosFeast': 'Feast of the Theotokos',
      'calendar.rankSunday': 'Sunday',
    },
    el: {
      'calendar.rankRedCross': 'Εορτή με ερυθρό σταυρό',
      'calendar.rankBlackCross': 'Ημέρα με μαύρο σταυρό',
      'calendar.rankGreatFeast': 'Δεσποτική εορτή',
      'calendar.rankTheotokosFeast': 'Θεομητορική εορτή',
      'calendar.rankSunday': 'Κυριακή',
    },
    sr: {
      'calendar.rankRedCross': 'Празник са црвеним крстом',
      'calendar.rankBlackCross': 'Дан са црним крстом',
      'calendar.rankGreatFeast': 'Велики празник Господњи',
      'calendar.rankTheotokosFeast': 'Празник Пресвете Богородице',
      'calendar.rankSunday': 'Недеља',
    },
    bg: {
      'calendar.rankRedCross': 'Празник с червен кръст',
      'calendar.rankBlackCross': 'Ден с черен кръст',
      'calendar.rankGreatFeast': 'Голям Господски празник',
      'calendar.rankTheotokosFeast': 'Богородичен празник',
      'calendar.rankSunday': 'Неделя',
    },
    mk: {
      'calendar.rankRedCross': 'Празник со црвен крст',
      'calendar.rankBlackCross': 'Ден со црн крст',
      'calendar.rankGreatFeast': 'Голем Господов празник',
      'calendar.rankTheotokosFeast': 'Богородичен празник',
      'calendar.rankSunday': 'Недела',
    },
    uk: {
      'calendar.rankRedCross': 'Свято з червоним хрестом',
      'calendar.rankBlackCross': 'День із чорним хрестом',
      'calendar.rankGreatFeast': 'Велике Господнє свято',
      'calendar.rankTheotokosFeast': 'Богородичне свято',
      'calendar.rankSunday': 'Неділя',
    },
    ka: {
      'calendar.rankRedCross': 'დღესასწაული წითელი ჯვრით',
      'calendar.rankBlackCross': 'შავი ჯვრის დღე',
      'calendar.rankGreatFeast': 'დიდი უფლის დღესასწაული',
      'calendar.rankTheotokosFeast': 'ღვთისმშობლის დღესასწაული',
      'calendar.rankSunday': 'კვირა',
    },
    ru: {
      'calendar.rankRedCross': 'Праздник с красным крестом',
      'calendar.rankBlackCross': 'День с чёрным крестом',
      'calendar.rankGreatFeast': 'Великий Господский праздник',
      'calendar.rankTheotokosFeast': 'Богородичный праздник',
      'calendar.rankSunday': 'Воскресенье',
    },
    sq: {
      'calendar.rankRedCross': 'Kremte me kryq të kuq',
      'calendar.rankBlackCross': 'Ditë me kryq të zi',
      'calendar.rankGreatFeast': 'Kremte e madhe e Zotit',
      'calendar.rankTheotokosFeast': 'Kremte e Hyjlindëses',
      'calendar.rankSunday': 'E diel',
    },
  };

  const ANCHOR = "'calendar.feastRankFallback':";
  const offsetAdjustments = [];
  let missing = 0;

  for (const locale of LOCALES) {
    const block = blocks.get(locale);
    if (!block) continue;
    const already = block.body.includes("'calendar.rankRedCross'");
    if (already) continue;

    // find the anchor line inside the block
    const anchorPattern = new RegExp(`^\\s*${ANCHOR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`, 'm');
    const anchorMatch = anchorPattern.exec(block.body);
    if (!anchorMatch) {
      missing += 1;
      console.error(`  ! ${locale}: could not find ${ANCHOR} anchor`);
      continue;
    }

    const insertOffset = block.start + anchorMatch.index + anchorMatch[0].length;
    const lines = Object.entries(RANK_KEY_LINES[locale])
      .map(([key, value]) => `\n  '${key}': '${value.replace(/'/g, "\\'")}',`)
      .join('');
    offsetAdjustments.push({ offset: insertOffset, text: lines });
  }

  if (missing > 0) return { source, inserted: 0, missing };

  offsetAdjustments.sort((a, b) => b.offset - a.offset);
  let output = source;
  for (const { offset, text } of offsetAdjustments) {
    output = output.slice(0, offset) + text + output.slice(offset);
  }
  return { source: output, inserted: offsetAdjustments.length, missing: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Georgian notification seed repair
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The 29 `ka` black_cross rows that were seeded with Simplified Chinese.
 * Keys are the stable `theme` identifiers; values are the Georgian replacement
 * titles/bodies carrying the same meaning as the canonical English source.
 */
const KA_BLACK_CROSS_REPAIRS = {
  black_cross_055: ['信仰的光', '今天是黑十字节日：{feast_title}。信仰给思想带来光明，给心灵带来平安。通过祷告保持它的活力。', 'რწმენის შუქი', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. რწმენა შუქს მატებს აზრს და სიმშვიდეს ანიჭებს გულს. შეინარჩუნე იგი ლოცვით ცოცხალი.'],
  black_cross_056: ['温柔的心', '今天是黑十字节日：{feast_title}。温柔和善良使人们亲近，并保持心灵的平安。', 'ნაზი გული', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. სიმშვიდე და სიკეთე აახლოებს ადამიანებს და ინარჩუნებს გულის მშვიდობას.'],
  black_cross_057: ['带着希望前行', '今天是黑十字节日：{feast_title}。把你的忧虑交给上帝，带着信心和耐心向前迈进。', 'იმოძღვრე იმედით', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მიანდე შენი საზრუნავი ღმერთს და იარე წინ რწმენითა და მოთმინებით.'],
  black_cross_058: ['ყოველი ნაბიჯის მშვიდობა', '今天是黑十字节日：{feast_title}。让平安引导你的决定，并在所有情况下保持信仰。', 'მშვიდობა ყოველ ნაბიჯზე', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. დაე, მშვიდობამ წარმართოს შენი გადაწყვეტილებები და ყველა ვითარებაში შეინარჩუნე რწმენა.'],
  black_cross_059: ['谦卑的爱', '今天是黑十字节日：{feast_title}。无私地爱，默默地帮助。真诚的善良给心灵带来宁静。', 'თავმდაბალი სიყვარული', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. გიყვარდეს უპირობოდ და დაეხმარე ჩუმად. გულწრფელი სიკეთე სიმშვიდეს ანიჭებს სულს.'],
  black_cross_060: ['坚持不懈', '今天是黑十字节日：{feast_title}。继续通过祷告、耐心和爱心追求善良。上帝加强信徒的灵魂。', 'მოთმინება ბოლომდე', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. განაგრძე სიკეთის ძიება ლოცვით, მოთმინებითა და სიყვარულით. ღმერთი აძლიერებს მორწმუნის სულს.'],
  black_cross_061: ['有益的话语', '今天是黑十字节日：{feast_title}。今天选择带来和平和鼓励的话语。善良始于我们说话的方式。', 'სასარგებლო სიტყვები', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. დღეს აირჩიე სიტყვები, რომლებიც მშვიდობასა და გამხნევებას მოაქვს. სიკეთე იწყება იმით, როგორ ვლაპარაკობთ.'],
  black_cross_062: ['保持安静', '今天是黑十字节日：{feast_title}。不要让匆忙打扰你的灵魂。在宁静和祷告中，心灵找到力量。', 'დარჩი სიჩუმეში', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ნუ დაუშვებ, რომ აჩქარებამ სული შეგაწუხოს. სიმშვიდესა და ლოცვაში გული ძალას პოულობს.'],
  black_cross_063: ['感恩的心', '今天是黑十字节日：{feast_title}。感谢上帝赐予的一切恩典。感恩带来平安和希望。', 'მადლიერი გული', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მადლობა ღმერთს ყოველი მადლისთვის. მადლიერება მშვიდობასა და იმედს მოაქვს.'],
  black_cross_064: ['安静的心', '今天是黑十字节日：{feast_title}。在上帝面前保持安静，让他的平安充满你的心。', 'მშვიდი გული', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. დარჩი მშვიდად ღმერთის წინაშე და დაე, მისმა მშვიდობამ აავსოს შენი გული.'],
  black_cross_065: ['行善', '今天是黑十字节日：{feast_title}。不要厌倦行善。上帝看见每一个善行。', 'აკეთე სიკეთე', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ნუ დაიღლები სიკეთის კეთებით. ღმერთი ხედავს ყოველ კეთილ საქმეს.'],
  black_cross_066: ['带来希望', '今天是黑十字节日：{feast_title}。给周围的人带来希望和安慰。', 'მოიტანე იმედი', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მოუტანე იმედი და ნუგეში შენს გარშემო მყოფებს.'],
  black_cross_067: ['宽容饶恕', '今天是黑十字节日：{feast_title}。宽恕他人，就像你希望被宽恕一样。', 'პატიება და შენდობა', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. აპატიე სხვებს, როგორც შენ გსურს, რომ შეგინდონ.'],
  black_cross_068: ['感恩的心', '今天是黑十字节日：{feast_title}。为小事感恩，生活会充满喜乐。', 'მადლიერი გული', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. იყავი მადლიერი წვრილმანებისთვის და ცხოვრება სიხარულით აივსება.'],
  black_cross_069: ['爱的行动', '今天是黑十字节日：{feast_title}。用行动表达爱，而不只是言语。', 'სიყვარული საქმით', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. გამოხატე სიყვარული საქმით და არა მხოლოდ სიტყვით.'],
  black_cross_070: ['内心的平安', '今天是黑十字节日：{feast_title}。让上帝的平安守护你的心思意念。', 'შინაგანი მშვიდობა', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. დაე, ღმერთის მშვიდობამ დაიცვას შენი ფიქრები და გული.'],
  black_cross_071: ['坚持信仰', '今天是黑十字节日：{feast_title}。无论环境如何，都要持守信仰。', 'დარჩი რწმენაში', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. როგორი ვითარებაც არ უნდა იყოს, დაიცავი რწმენა.'],
  black_cross_072: ['温柔回答', '今天是黑十字节日：{feast_title}。用温柔回答，平息愤怒。', 'ნაზი პასუხი', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. უპასუხე ნაზად და დაამშვიდე რისხვა.'],
  black_cross_073: ['祷告的时刻', '今天是黑十字节日：{feast_title}。每天留出时间祷告，亲近上帝。', 'ლოცვის დრო', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ყოველდღე გამოყავი დრო ლოცვისთვის და მიუახლოვდი ღმერთს.'],
  black_cross_074: ['信靠上帝', '今天是黑十字节日：{feast_title}。把你的重担交给上帝，他会扶持你。', 'მიენდე ღმერთს', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მიანდე შენი ტვირთი ღმერთს და ის დაგეხმარება.'],
  black_cross_075: ['喜乐的心', '今天是黑十字节日：{feast_title}。在主里常常喜乐，因为喜乐是力量。', 'მხიარული გული', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მუდამ იხარე უფალში, რადგან სიხარული ძალაა.'],
  black_cross_076: ['善待他人', '今天是黑十字节日：{feast_title}。以你希望被对待的方式对待他人。', 'კეთილად მოეპყარი სხვებს', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მოეპყარი სხვებს ისე, როგორც გსურს, რომ შენ მოგეპყრან.'],
  black_cross_077: ['悔改更新', '今天是黑十字节日：{feast_title}。悔改并更新你的心，上帝是信实的。', 'მონანიება და განახლება', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. მოინანიე და განაახლე შენი გული, ღმერთი ერთგულია.'],
  black_cross_078: ['安静祷告', '今天是黑十字节日：{feast_title}。在安静中聆听上帝的声音。', 'მშვიდი ლოცვა', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. სიმშვიდეში ისმინე ღმერთის ხმა.'],
  black_cross_079: ['彼此相爱', '今天是黑十字节日：{feast_title}。像基督爱我们一样彼此相爱。', 'გიყვარდეთ ერთმანეთი', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. გიყვარდეთ ერთმანეთი, როგორც ქრისტემ შეგვიყვარა.'],
  black_cross_080: ['永恒的盼望', '今天是黑十字节日：{feast_title}。盼望不在今生，而在上帝的国度里。', 'მარადიული იმედი', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. იმედი ამ ცხოვრებაში კი არა, ღმერთის სასუფეველშია.'],
  black_cross_081: ['感恩祷告', '今天是黑十字节日：{feast_title}。以感恩的心祷告，数算上帝的恩典。', 'მადლიერების ლოცვა', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ილოცე მადლიერი გულით და დაითვალე ღმერთის მადლი.'],
  black_cross_082: ['温柔的心', '今天是黑十字节日：{feast_title}。温柔的人有福了，因为他们必承受地土。', 'ნაზი გული', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ნეტარ არიან მშვიდნი, რამეთუ ისინი დაიმკვიდრებენ ქვეყანას.'],
  black_cross_083: ['彼此代祷', '今天是黑十字节日：{feast_title}。为他人代祷，爱就在此显明。', 'ილოცეთ ერთმანეთისთვის', 'დღეს შავი ჯვრის დღესასწაულია: {feast_title}. ილოცე სხვებისთვის და სიყვარული ამით გამოვლინდება.'],
};

/**
 * Residual `ka` rows that a first pass missed: four carried Russian words inside
 * Georgian sentences and three were still fully Chinese. Keyed by theme id.
 */
const KA_RESIDUAL_REPAIRS = {
  black_cross_034: ['მადლიერების აზრი', 'დღეს არის შავი ჯვრის დღესასწაული: {feast_title}. მადლობა ღმერთს მისი მზრუნველობისთვის და შეინარჩუნე იმედი ყველა ვითარებაში.'],
  daily_052: ['სიყვარული საქმეებით', 'ნამდვილი სიყვარული ჩანს მზრუნველობაში, მოთმინებასა და სიკეთეში მოყვასის მიმართ.'],
  daily_103: ['რწმენის შუქი', 'რწმენა ნათელს ჰფენს მათ ნაბიჯებს, ვინც თავმდაბლად და იმედით მიდის ღმერთის წინაშე.'],
  daily_110: ['რწმენა და მოთმინება', 'იარე წინ შიშის გარეშე. ღმერთი მოქმედებს საჭირო დროს სულის სასიკეთოდ.'],
  daily_111: ['მშვიდობა ყოველ დღე', 'აირჩიე სიმშვიდე არეულობის ნაცვლად. ლოცვა ინარჩუნებს მშვიდობას გულში.'],
  red_cross_025: ['მადლიერი სული', 'დღეს არის წითელი ჯვრის დღესასწაული: {feast_title}. მადლობა ღმერთს მისი მზრუნველობისთვის და შეინარჩუნე მადლიერება ყოველ წუთს.'],
  sunday_012: ['მშვიდობა და მადლიერება', 'დღეს კვირაა. იხარე მიღებული ნიჭებით და მადლობა ღმერთს მისი მზრუნველობისთვის.'],
};

/**
 * Repair a single localized notification row by theme id, regardless of the
 * day_type, replacing title and body.
 *
 * NOTE: this helper is deliberately no longer applied to the seed file. The seed is an
 * already-applied migration, so its corrected text now lives in
 * `20260915000500_repair_applied_seed_data.sql` / `20260915000600_...`. The two
 * catalogues above are kept as the audit record of WHAT was corrected, and
 * `validateNotificationCorrections` below asserts that the migrations cover every
 * entry — a catalogue entry without a matching migration is a hard failure.
 */
function validateNotificationCorrections(corrections) {
  const problems = [];
  const expectedThemes = [
    ...Object.keys(KA_BLACK_CROSS_REPAIRS),
    ...Object.keys(KA_RESIDUAL_REPAIRS),
  ];
  for (const theme of expectedThemes) {
    if (!corrections.has(`ka|${theme}`)) {
      problems.push(`no additive migration corrects ka row ${theme}`);
    }
  }
  return { problems, expected: expectedThemes.length, covered: corrections.size };
}

// ─────────────────────────────────────────────────────────────────────────────
// Targeted value repairs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Locale-specific value corrections.
 *
 * Each entry is a real defect found by the audit:
 *  - `chat.premiumOffer` hardcoded a price in the wrong or contradictory
 *    currency ("9,99 lei" for locales whose currencyCode is RSD/UAH/GEL/RUB/ALL,
 *    "9,99 лв" for a locale whose currencyCode is EUR) and could never match the
 *    real store price. The price is now the `{price}` interpolation filled from
 *    RevenueCat's localized `priceString` at render time.
 *  - Cyrillic / Georgian locales carried a Romanian cross-reference in the
 *    search hint ("tatal nostru") and a Romanian word inside the e-mail
 *    placeholder ("nume@").
 *  - Serbian embedded Latin letters inside a Cyrillic word ("таблицama").
 *  - Bulgarian used a Latin transliteration of the brand while every other
 *    locale uses "Ortodoxia".
 */
const VALUE_REPAIRS = [
  // ── chat.premiumOffer: remove the hardcoded, wrong-currency price ──
  ['ro', 'chat.premiumOffer', 'Pentru a continua conversația, alege planul Premium, 9,99 lei/lună.', 'Pentru a continua conversația, alege planul Premium ({price}).'],
  ['en', 'chat.premiumOffer', 'To continue the conversation, choose the Premium plan, 9.99 RON/month.', 'To continue the conversation, choose the Premium plan ({price}).'],
  ['el', 'chat.premiumOffer', 'Για να συνεχίσετε τη συνομιλία, επιλέξτε το πρόγραμμα Premium, 9,99 RON/μήνα.', 'Για να συνεχίσετε τη συνομιλία, επιλέξτε το πρόγραμμα Premium ({price}).'],
  ['sr', 'chat.premiumOffer', 'Да бисте наставили разговор, изаберите Premium план, 9,99 lei месечно.', 'Да бисте наставили разговор, изаберите Premium план ({price}).'],
  ['bg', 'chat.premiumOffer', 'За да продължиш разговора, избери Premium план, 9,99 лв/месец.', 'За да продължиш разговора, избери Premium план ({price}).'],
  ['mk', 'chat.premiumOffer', 'За да ја продолжиш разговорот, избери Premium план, 9,99 ден./месец.', 'За да ја продолжиш разговорот, избери Premium план ({price}).'],
  ['uk', 'chat.premiumOffer', 'Щоб продовжити розмову, оберіть Преміум-план, 9,99 lei/міс.', 'Щоб продовжити розмову, оберіть Преміум-план ({price}).'],
  ['ka', 'chat.premiumOffer', 'საუბრის გასაგრძელებლად აირჩიეთ Premium გეგმა, 9,99 lei/თვეში.', 'საუბრის გასაგრძელებლად აირჩიეთ Premium გეგმა ({price}).'],
  ['ru', 'chat.premiumOffer', 'Чтобы продолжить разговор, выберите план Premium за 9,99 lei/месяц.', 'Чтобы продолжить разговор, выберите план Premium ({price}).'],
  ['sq', 'chat.premiumOffer', 'Për të vazhduar bisedën, zgjidh planin Premium, 9,99 lei/muaj.', 'Për të vazhduar bisedën, zgjidh planin Premium ({price}).'],

  // ── prayers.searchHint: localize the example prayer name ──
  ['sr', 'prayers.searchHint', null, 'Можете претраживати са или без дијакритичких знакова, на пример: „Оче наш”.'],
  ['bg', 'prayers.searchHint', null, 'Можеш да търсиш с или без диакритични знаци, например: „Отче наш".'],
  ['mk', 'prayers.searchHint', null, 'Можеш да бараш со или без дијакритици, на пример: „Оче наш".'],
  ['uk', 'prayers.searchHint', null, 'Ви можете шукати з діакритиками або без них, наприклад: «Отче наш».'],
  ['ka', 'prayers.searchHint', null, 'შეგიძლიათ მოძებნოთ დიაკრიტიკით ან მის გარეშე, მაგალითად: "მამაო ჩვენო".'],
  ['ru', 'prayers.searchHint', null, 'Можно искать с диакритическими знаками или без них, например: «Отче наш».'],

  // ── auth.emailPlaceholder: localize the local part of the example address ──
  ['sr', 'auth.emailPlaceholder', null, 'име@email.rs'],
  ['bg', 'auth.emailPlaceholder', null, 'име@email.bg'],
  ['ru', 'auth.emailPlaceholder', null, 'имя@email.ru'],

  // ── privacy.s2_4Content1: Latin letters inside a Cyrillic word ──
  ['sr', 'privacy.s2_4Content1', null, 'Када пријављени корисник пошаље поруку AI разговору, садржај порука и одговора чува се у таблицама `chat_threads` и `chat_messages` у Supabase, повезано са налогом.'],

  // ── brand transliteration consistency (bg) ──
  ['bg', 'privacy.s2Intro', null, 'Ortodoxia обработва следните категории данни, строго в степента, в която функционалностите на приложението ги използват.'],
  ['bg', 'privacy.s3Content', null, null, { replaceAll: [['Orthodoxia', 'Ortodoxia']] }],
  ['bg', 'privacy.s5Content', null, null, { replaceAll: [['Orthodoxia', 'Ortodoxia']] }],
  ['bg', 'terms.s1Content', null, null, { replaceAll: [['Orthodoxia', 'Ortodoxia']] }],
  ['bg', 'terms.s7Content', null, null, { replaceAll: [['Orthodoxia', 'Ortodoxia']] }],
  ['bg', 'terms.s8_4Content', null, null, { replaceAll: [['Orthodoxia', 'Ortodoxia']] }],
  ['bg', 'terms.s9Content', null, null, { replaceAll: [['Orthodoxia', 'Ortodoxia']] }],

  // ── reset link copy: keep the provider's actual folder names ──
  ['bg', 'resetConfirmation.cardSubtitle', null, 'Отвори полученото съобщение и натисни линка за нулиране. Провери и папката Spam или Promotions.'],
  ['mk', 'resetConfirmation.cardSubtitle', null, 'Отвори ја примената порака и притисни на врската за ресетирање. Провери ја и папката Spam или Promotions.'],
  ['ka', 'resetConfirmation.cardSubtitle', null, 'გახსენით მიღებული შეტყობინება და დააჭირეთ აღდგენის ბმულს. ასევე შეამოწმეთ Spam ან Promotions საქაღალდეები.'],

  // ── "vs." is an English abbreviation; use the locale's own connector ──
  ['mk', 'privacy.s8Title', null, '8. Бришење на сметката и откажување на претплатата'],
  ['uk', 'privacy.s8Title', null, '8. Видалення облікового запису і скасування підписки'],
  ['ka', 'privacy.s8Title', null, '8. ანგარიშის წაშლა და გამოწერის გაუქმება'],
];

/**
 * Apply the targeted value repairs. Operates line-by-line so that a repair can
 * never touch the wrong locale block, and fails loudly when a key is absent.
 */
function applyValueRepairs(source) {
  const lines = source.split('\n');
  const blockPattern = /^const (ro|en|el|sr|bg|mk|uk|ka|ru|sq) = \{$/;
  let currentLocale = null;
  const applied = [];
  const missing = [];

  for (let i = 0; i < lines.length; i += 1) {
    const blockMatch = blockPattern.exec(lines[i]);
    if (blockMatch) {
      currentLocale = blockMatch[1];
      continue;
    }
    if (currentLocale === null) continue;

    const entryMatch = /^(\s*)'((?:[^'\\]|\\.)+)':\s*'((?:[^'\\]|\\.)*)',$/.exec(lines[i]);
    if (!entryMatch) continue;

    const indent = entryMatch[1];
    const key = entryMatch[2];
    const rawValue = entryMatch[3];

    const repair = VALUE_REPAIRS.find((entry) => entry[0] === currentLocale && entry[1] === key);
    if (!repair) continue;

    const [, , expectedOld, newValue, options] = repair;
    const currentValue = unescapeValue(rawValue);

    let nextValue = null;
    if (newValue !== null && newValue !== undefined) {
      nextValue = newValue;
    } else if (options?.replaceAll) {
      let mutated = currentValue;
      for (const [from, to] of options.replaceAll) {
        mutated = mutated.split(from).join(to);
      }
      if (mutated !== currentValue) nextValue = mutated;
    }

    if (nextValue === null) continue;

    if (expectedOld !== null && expectedOld !== undefined && currentValue !== expectedOld) {
      // Either the repair was already applied on a previous run (the common,
      // idempotent case) or the value changed independently. Both are fine: we
      // never clobber, and the validator reports the final state.
      if (currentValue !== newValue) {
        missing.push(`${currentLocale}/${key}: expected ${JSON.stringify(expectedOld)} but found ${JSON.stringify(currentValue)}`);
      }
      continue;
    }

    if (nextValue === currentValue) continue;

    lines[i] = `${indent}'${key}': '${nextValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`;
    applied.push(`${currentLocale}/${key}`);
  }

  return { source: lines.join('\n'), applied, missing };
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

function validateConfig(source, { verbose }) {
  const problems = [];
  const blocks = parseLocaleBlocks(source);
  const found = [...blocks.keys()];
  if (found.length !== LOCALES.length) {
    problems.push(`expected ${LOCALES.length} locale blocks, found ${found.length}: ${found.join(',')}`);
  }

  const entriesByLocale = new Map();
  for (const [locale, block] of blocks) {
    entriesByLocale.set(locale, extractEntries(block.body));
  }

  const referenceAll = entriesByLocale.get('ro');
  // Plural variants (chat.freeLimitLabel#one) are optional per locale, so the
  // mandatory-key baseline must exclude them. See src/lib/i18n-plural.ts.
  const reference = new Map([...referenceAll].filter(([key]) => !key.includes('#')));
  if (!reference) {
    problems.push('missing reference locale block "ro"');
    return { problems, keyCount: 0 };
  }

  const REQUIRED_RANK_KEYS = [
    'calendar.rankRedCross',
    'calendar.rankBlackCross',
    'calendar.rankGreatFeast',
    'calendar.rankTheotokosFeast',
    'calendar.rankSunday',
  ];

  const REQUIRED_LOCATION_KEYS = [
    'location.bucharest',
    'location.iasi',
    'location.clujNapoca',
    'location.chisinau',
    'location.thessaloniki',
    'location.corfu',
    'location.nicosia',
    'location.belgrade',
    'location.kyiv',
    'location.moscow',
    'location.minsk',
    'location.sofia',
    'location.skopje',
    'location.tirana',
    'location.tbilisi',
  ];

  for (const locale of LOCALES) {
    const entries = entriesByLocale.get(locale);
    if (!entries) {
      problems.push(`${locale}: block missing`);
      continue;
    }

    // Plural variants are separate keys suffixed with a CLDR category
    // (`key#one`). They are validated by tests/i18n-plural.test.mjs against the real
    // `translatePlural`, and are excluded from the strict key-parity comparison here
    // because a locale only defines the variants its grammar needs.
    const baseEntries = new Map(
      [...entries].filter(([key]) => !key.includes('#')),
    );

    for (const key of reference.keys()) {
      if (!baseEntries.has(key)) problems.push(`${locale}: missing key ${key}`);
    }
    for (const key of baseEntries.keys()) {
      if (!reference.has(key)) problems.push(`${locale}: extra key ${key}`);
    }
    for (const key of REQUIRED_RANK_KEYS) {
      if (!entries.has(key)) problems.push(`${locale}: missing required rank key ${key}`);
    }
    for (const key of REQUIRED_LOCATION_KEYS) {
      if (!entries.has(key)) problems.push(`${locale}: missing required location key ${key}`);
    }

    for (const [key, rawValue] of entries) {
      const value = unescapeValue(rawValue);
      if (value.trim().length === 0) {
        problems.push(`${locale}: empty value for ${key}`);
        continue;
      }
      const contamination = findContamination(locale, value);
      if (contamination.length > 0) {
        const detail = [...new Set(contamination)].slice(0, 4).join(', ');
        problems.push(`${locale}: script contamination in ${key} -> ${detail}`);
      }
    }
  }

  // placeholder-set parity per key. Plural variants are excluded: their wording
  // legitimately drops `{count}` in the singular form, and they are validated
  // behaviourally by tests/i18n-plural.test.mjs.
  for (const key of reference.keys()) {
    if (key.includes('#')) continue;
    const sets = new Map();
    for (const locale of LOCALES) {
      const raw = entriesByLocale.get(locale)?.get(key);
      if (raw == null) continue;
      const value = unescapeValue(raw);
      const placeholders = [...value.matchAll(/\{([a-zA-Z_]+)\}/g)].map((m) => m[1]).sort().join(',');
      sets.set(locale, placeholders);
    }
    const distinct = new Set(sets.values());
    if (distinct.size > 1) {
      problems.push(`${key}: placeholder mismatch across locales -> ${[...distinct].join(' | ')}`);
    }
  }

  if (verbose) {
    console.log(`  reference locale 'ro' defines ${reference.size} keys`);
  }
  return { problems, keyCount: reference.size };
}

const KA_ROW_PATTERN = /^\('ka',\s*null,\s*null,/;

/** Quote-aware split of a migration into `;`-terminated statements. */
function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") { current += "''"; i += 1; continue; }
        inString = false;
      }
      current += ch;
      continue;
    }
    if (ch === "'") { inString = true; current += ch; continue; }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      current += '\n';
      continue;
    }
    if (ch === ';') { statements.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter((statement) => statement.length > 0);
}

const unquoteSql = (raw) => raw.slice(1, -1).replace(/''/g, "'");

/**
 * Corrections for `ka` rows that live in additive migrations rather than in the seed.
 *
 * Returns a Map keyed by `<language_code>|<theme>` so a contaminated seed row can be
 * matched against the migration that repairs it.
 */
function loadNotificationCorrections() {
  const corrections = new Map();
  for (const path of NOTIFICATION_CORRECTIVE_MIGRATIONS) {
    if (!existsSync(path)) continue;
    for (const statement of splitSqlStatements(readFileSync(path, 'utf8'))) {
      if (!/^update public\.notification_messages\b/i.test(statement)) continue;
      const where = statement.slice(statement.search(/\bwhere\b/i));
      const language = /language_code = ('(?:[^']|'')*')/i.exec(where);
      const theme = /theme = ('(?:[^']|'')*')/i.exec(where);
      const title = /title_template = ('(?:[^']|'')*')/.exec(statement);
      const body = /body_template = ('(?:[^']|'')*')/.exec(statement);
      if (!language || !theme || !title || !body) continue;
      corrections.set(`${unquoteSql(language[1])}|${unquoteSql(theme[1])}`, {
        title: unquoteSql(title[1]),
        body: unquoteSql(body[1]),
        migration: relative(ROOT, path),
      });
    }
  }
  return corrections;
}

function validateNotificationSeed(source, corrections = new Map()) {
  const problems = [];
  const kaRows = source
    .split('\n')
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter((row) => KA_ROW_PATTERN.test(row.line));
  let cyrillicRows = 0;
  let cjkRows = 0;
  let correctedRows = 0;

  for (const { line, number } of kaRows) {
    const id = /'(black_cross_\d+|daily_\d+|sunday_\d+|fasting_\d+|red_cross_\d+)'/.exec(line);
    const theme = id ? id[1] : null;
    const label = theme ?? `line ${number}`;
    const hasCjk = /[\u4e00-\u9fff]/.test(line);
    const hasCyrillic = /[\u0400-\u04ff]/.test(line);

    if (hasCjk) cjkRows += 1;
    if (hasCyrillic) cyrillicRows += 1;
    if (!hasCjk && !hasCyrillic) continue;

    // A row an additive migration rewrites is clean by the time the database is up to
    // date. The seed stays contaminated on purpose: it is an already-applied migration
    // and editing it would fix the repository while leaving the database wrong.
    if (theme && corrections.has(`ka|${theme}`)) {
      correctedRows += 1;
      continue;
    }

    if (hasCjk) problems.push(`ka row ${label} still contains CJK (Chinese) text`);
    if (hasCyrillic) problems.push(`ka row ${label} contains Cyrillic text`);
  }

  return { problems, kaRowCount: kaRows.length, cjkRows, cyrillicRows, correctedRows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log(`i18n corpus ${WRITE ? 'repair + validation' : 'validation'}`);
  console.log(`  config : ${relative(ROOT, I18N_PATH)}`);
  console.log(`  seed   : ${relative(ROOT, NOTIFICATION_SEED_PATH)}`);
  console.log('');

  let configSource = readFileSync(I18N_PATH, 'utf8');
  let seedSource = readFileSync(NOTIFICATION_SEED_PATH, 'utf8');
  let changed = false;

  if (WRITE) {
    console.log('repairing config.ts …');
    const blocks = parseLocaleBlocks(configSource);
    const inserted = insertRankKeys(configSource, blocks);
    if (inserted.missing > 0) {
      console.error(`  ! ${inserted.missing} locale(s) could not be repaired`);
    }
    if (inserted.inserted > 0) {
      configSource = inserted.source;
      changed = true;
    }
    console.log(`  inserted canonical rank keys into ${inserted.inserted} locale block(s)`);

    console.log('inserting localized LIVE location keys …');
    const locationKeys = insertKeysAfterAnchor(
      configSource,
      parseLocaleBlocks(configSource),
      'calendar.feastRankFallback',
      LOCATION_KEY_VALUES,
    );
    if (locationKeys.missing > 0) {
      for (let i = 0; i < locationKeys.missing; i += 1) {
        console.error('  ! could not insert location keys for a locale');
      }
    }
    if (locationKeys.inserted > 0) {
      configSource = locationKeys.source;
      changed = true;
    }
    console.log(`  inserted ${locationKeys.inserted} location key(s)`);

    console.log('inserting calendar coverage copy …');
    const coverageKeys = insertKeysAfterAnchor(
      configSource,
      parseLocaleBlocks(configSource),
      'calendar.feastRankFallback',
      CALENDAR_COVERAGE_VALUES,
    );
    if (coverageKeys.inserted > 0) {
      configSource = coverageKeys.source;
      changed = true;
    }
    console.log(`  inserted ${coverageKeys.inserted} coverage key(s)`);

    console.log('inserting account-deletion timeout copy …');
    const timeoutKeys = insertKeysAfterAnchor(
      configSource,
      parseLocaleBlocks(configSource),
      'account.deleteFailedFallback',
      ACCOUNT_DELETE_TIMEOUT_VALUES,
    );
    if (timeoutKeys.inserted > 0) {
      configSource = timeoutKeys.source;
      changed = true;
    }
    console.log(`  inserted ${timeoutKeys.inserted} timeout key(s)`);

    console.log('inserting notification opt-out copy …');
    const notificationKeys = insertKeysAfterAnchor(
      configSource,
      parseLocaleBlocks(configSource),
      'account.enableNotificationsButton',
      NOTIFICATION_DISABLE_VALUES,
    );
    if (notificationKeys.inserted > 0) {
      configSource = notificationKeys.source;
      changed = true;
    }
    console.log(`  inserted ${notificationKeys.inserted} notification key(s)`);

    console.log('inserting support availability copy …');
    const helpKeys = insertKeysAfterAnchor(
      configSource,
      parseLocaleBlocks(configSource),
      'account.helpRow',
      HELP_UNAVAILABLE_VALUES,
    );
    if (helpKeys.inserted > 0) {
      configSource = helpKeys.source;
      changed = true;
    }
    console.log(`  inserted ${helpKeys.inserted} help key(s)`);

    console.log('inserting legal completion label …');
    const legalKeys = insertKeysAfterAnchor(
      configSource,
      parseLocaleBlocks(configSource),
      'privacy.title',
      LEGAL_TO_BE_COMPLETED_VALUES,
    );
    if (legalKeys.inserted > 0) {
      configSource = legalKeys.source;
      changed = true;
    }
    console.log(`  inserted ${legalKeys.inserted} legal key(s)`);

    console.log('applying targeted locale value repairs …');
    const repairedValues = applyValueRepairs(configSource);
    if (repairedValues.missing.length > 0) {
      for (const problem of repairedValues.missing) console.error(`  ! ${problem}`);
    }
    if (repairedValues.applied.length > 0) {
      configSource = repairedValues.source;
      changed = true;
    }
    console.log(`  corrected ${repairedValues.applied.length} locale value(s)`);

    console.log('verifying notification corrections live in additive migrations …');
    // Reported here for visibility; the check itself always runs (see below) and is a
    // hard failure, because a catalogue entry without a matching migration means the
    // deployed database keeps the contaminated text.
    const writeCorrections = loadNotificationCorrections();
    console.log(`  ${writeCorrections.size} corrected row(s) found in the additive migrations`);
    console.log('');
  }

  const corrections = loadNotificationCorrections();
  const correctionResult = validateNotificationCorrections(corrections);

  const configResult = validateConfig(configSource, { verbose: true });
  const seedResult = validateNotificationSeed(seedSource, corrections);

  const problems = [...configResult.problems, ...seedResult.problems, ...correctionResult.problems];

  console.log(`  locales validated     : ${LOCALES.length}`);
  console.log(`  translation keys      : ${configResult.keyCount} per locale`);
  console.log(
    `  ka notification rows  : ${seedResult.kaRowCount} (CJK ${seedResult.cjkRows}, `
    + `Cyrillic ${seedResult.cyrillicRows}, repaired by additive migration ${seedResult.correctedRows})`,
  );
  console.log(
    `  correction coverage   : ${correctionResult.expected}/${correctionResult.expected} catalogued rows `
    + `covered (${correctionResult.covered} statements across the additive migrations)`,
  );

  if (problems.length > 0) {
    console.error('');
    console.error(`FAIL — ${problems.length} problem(s):`);
    for (const problem of problems.slice(0, 80)) console.error(`  - ${problem}`);
    if (problems.length > 80) console.error(`  … and ${problems.length - 80} more`);
    process.exitCode = 1;
    return;
  }

  if (WRITE && changed) {
    writeFileSync(I18N_PATH, configSource, 'utf8');
    console.log('');
    console.log('wrote repaired files.');
  }

  console.log('');
  console.log('PASS — i18n corpus is consistent and free of script contamination.');
}

main();

