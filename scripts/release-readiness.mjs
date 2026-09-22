#!/usr/bin/env node
/**
 * Release readiness gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * The audit found that the app was structurally ready but carried blockers that
 * only materialise at release time: unfilled legal placeholders, client env
 * variables that exist only in a git-ignored .env (so an EAS build produces a
 * binary that throws at boot), a missing EAS projectId, RevenueCat keys that are
 * test-only, template assets in the store listing, and content corpora that live
 * only in the remote database.
 *
 * Those items cannot be "fixed in code" — they need paid accounts, credentials or
 * real data. What CAN be built now is the gate that refuses to let a broken build
 * ship once those inputs are supposed to be filled in. This script is that gate.
 *
 * TWO MODES
 * ---------
 *   node scripts/release-readiness.mjs
 *       Default. Verifies the parts that must hold TODAY (source hygiene, i18n
 *       integrity, calendar coverage, content wiring, test wiring). Exit 1 on any
 *       violation. This is what CI runs.
 *
 *   node scripts/release-readiness.mjs --release
 *       Everything above, PLUS the paid-launch checklist: real legal identity,
 *       support contact, EAS projectId, production RevenueCat keys, absence of
 *       template assets. Exit 1 while any launch input is still a placeholder.
 *       Run this immediately before `eas build --profile production`.
 *
 * Every check prints either PASS, FAIL or DEFERRED (deferred only appears with
 * --release and lists exactly what external input is missing).
 *
 * No network access, no writes.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const RELEASE_MODE = process.argv.includes('--release');

const results = [];
function record(level, area, message, detail) {
  results.push({ level, area, message, detail });
}

function readIfExists(relPath) {
  const abs = join(ROOT, relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Legal placeholders (P-01)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Environment variable backing each legal/support value. Kept in sync with
 * `src/lib/legal-values.ts` (LEGAL_FIELD_ENV_VARS); the check below verifies that
 * the two lists agree so this cannot silently drift.
 */
const LEGAL_ENV_VARS = [
  'EXPO_PUBLIC_LEGAL_ENTITY',
  'EXPO_PUBLIC_SUPPORT_EMAIL',
  'EXPO_PUBLIC_LEGAL_POSTAL_ADDRESS',
  'EXPO_PUBLIC_LEGAL_JURISDICTION',
  'EXPO_PUBLIC_LEGAL_LOCALITY',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
  'EXPO_PUBLIC_TERMS_URL',
  'EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE',
];

const PLACEHOLDER_ENV_PATTERN = /^(your_|REPLACE|CHANGEME|TODO|\[)/i;

function readEnvFile(relPath) {
  const content = readIfExists(relPath);
  if (!content) return null;
  const vars = new Map();
  for (const line of content.split('\n')) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (match) vars.set(match[1], match[2].trim());
  }
  return vars;
}

/**
 * Legal identity and support contact.
 *
 * These values are configuration (`src/lib/legal-values.ts`), not prose, so
 * completeness is decidable instead of being inferred by grepping localized text.
 * Nothing here is invented: when a value is absent the app renders a localized
 * "to be completed" notice and this check reports exactly which variables are
 * missing.
 */
function checkLegalPlaceholders() {
  const legalValues = readIfExists('src/lib/legal-values.ts');
  if (!legalValues) {
    record('FAIL', 'legal', 'src/lib/legal-values.ts is missing');
    return;
  }

  // Guard against the value list and this checker drifting apart.
  const declared = [...legalValues.matchAll(/'(EXPO_PUBLIC_[A-Z_]+)'/g)].map((m) => m[1]);
  const missingFromSource = LEGAL_ENV_VARS.filter((name) => !declared.includes(name));
  if (missingFromSource.length > 0) {
    record(
      'FAIL',
      'legal',
      `legal-values.ts does not read: ${missingFromSource.join(', ')}`,
      'The checker and the app disagree about which values exist.',
    );
  }

  // The strings must carry placeholders, never bracketed completion tokens.
  const config = readIfExists('src/i18n/config.ts') ?? '';
  const leftoverTokens = [...config.matchAll(/\[[^\]]*(?:DE COMPLETAT|COMPLETAT|TODO|REPLACE_ME)[^\]]*\]/g)];
  if (leftoverTokens.length > 0) {
    record(
      'FAIL',
      'legal',
      `${leftoverTokens.length} bracketed completion token(s) still rendered inside legal strings`,
      `examples: ${[...new Set(leftoverTokens.map((m) => m[0]))].slice(0, 4).join(', ')}`,
    );
  } else {
    record('PASS', 'legal', 'legal strings carry interpolation placeholders, not bracketed tokens');
  }

  const requiredPlaceholders = [
    '{legalEntity}',
    '{supportAddress}',
    '{postalAddress}',
    '{jurisdiction}',
    '{locality}',
    '{privacyPolicyUrl}',
    '{termsUrl}',
    '{effectiveDate}',
  ];
  const missingPlaceholders = requiredPlaceholders.filter((token) => !config.includes(token));
  if (missingPlaceholders.length > 0) {
    record('FAIL', 'legal', `legal strings lost placeholder(s): ${missingPlaceholders.join(', ')}`);
  } else {
    record('PASS', 'legal', 'every legal placeholder is present in the corpus');
  }

  // Which values are actually supplied?
  const env = readEnvFile('.env');
  const configured = LEGAL_ENV_VARS.filter((name) => {
    const value = env?.get(name);
    return value && !PLACEHOLDER_ENV_PATTERN.test(value);
  });
  const missing = LEGAL_ENV_VARS.filter((name) => !configured.includes(name));

  if (missing.length === 0) {
    record('PASS', 'legal', 'legal identity and support contact are fully configured');
    return;
  }

  const detail = 'BLOCKED_NEEDS_USER_DATA: the operator identity, postal address, jurisdiction, '
    + 'support address and public legal URLs must be supplied by the project owner. They are data, not code: '
    + 'fill them as EAS environment variables and no source change is needed.';
  if (RELEASE_MODE) {
    record('FAIL', 'legal', `${missing.length} legal value(s) not configured`, `Missing: ${missing.join(', ')}. ${detail}`);
  } else {
    record('DEFERRED', 'legal', `${missing.length} legal value(s) not configured`, `Missing: ${missing.join(', ')}. ${detail}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Support contact (P-03)
// ─────────────────────────────────────────────────────────────────────────────

function checkSupportContact() {
  // The account screen renders a real mailto link as soon as a support address is
  // configured, and an explicit "not configured" notice otherwise.
  const account = readIfExists('src/app/(tabs)/account.tsx') ?? '';
  const usesConfig = account.includes('supportMailtoUrl')
    && (account.includes('Linking.openURL(supportMailto)') || account.includes('openURL(supportMailto)'));
  const hasFallbackNotice = account.includes('account.helpUnavailable');

  if (!usesConfig || !hasFallbackNotice) {
    record('FAIL', 'legal', 'the Help row is not wired to the support configuration');
    return;
  }

  const env = readEnvFile('.env');
  const supportEmail = env?.get('EXPO_PUBLIC_SUPPORT_EMAIL');
  const configured = Boolean(supportEmail) && !PLACEHOLDER_ENV_PATTERN.test(supportEmail ?? '');

  if (configured) {
    record('PASS', 'legal', 'an actionable support contact is configured and wired');
    return;
  }

  const detail = 'BLOCKED_NEEDS_USER_DATA: supply EXPO_PUBLIC_SUPPORT_EMAIL (and the public policy/terms URLs). '
    + 'The app already renders an actionable mailto link once the value exists, and shows an explicit notice until then.';
  if (RELEASE_MODE) {
    record('FAIL', 'legal', 'no actionable support contact configured', detail);
  } else {
    record('DEFERRED', 'legal', 'support contact not yet configured (the wiring is complete)', detail);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Required client environment variables (A-01)
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_PUBLIC_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
];

const RELEASE_PUBLIC_ENV = [
  ...REQUIRED_PUBLIC_ENV,
  'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY',
  'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY',
];

const PLACEHOLDER_VALUE_PATTERN = /^(your_|REPLACE|PROJECT_REF|sb_publishable_REPLACE)/i;

function checkEnvVariables() {
  const example = readIfExists('.env.example');
  if (!example) {
    record('FAIL', 'config', '.env.example is missing — required variables are undocumented');
  } else {
    const missingFromExample = [...REQUIRED_PUBLIC_ENV, 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY', 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY']
      .filter((name) => !new RegExp(`^${name}=`, 'm').test(example));
    if (missingFromExample.length > 0) {
      record('FAIL', 'config', `.env.example does not document: ${missingFromExample.join(', ')}`);
    } else {
      record('PASS', 'config', '.env.example documents every required client variable');
    }
  }

  // The real .env is git-ignored and therefore never reaches EAS. Its presence
  // only tells us about local development; release values must be registered as
  // EAS environment variables.
  const env = readIfExists('.env');
  if (!env) {
    record('FAIL', 'config', '.env is missing — the app cannot start locally');
  } else {
    const vars = new Map();
    for (const line of env.split('\n')) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match) vars.set(match[1], match[2].trim());
    }

    const missing = REQUIRED_PUBLIC_ENV.filter((name) => !vars.get(name));
    if (missing.length > 0) {
      record('FAIL', 'config', `.env is missing required variable(s): ${missing.join(', ')}`);
    } else {
      record('PASS', 'config', 'required local Supabase variables are present');
    }

    const placeholders = REQUIRED_PUBLIC_ENV.filter((name) => PLACEHOLDER_VALUE_PATTERN.test(vars.get(name) ?? ''));
    if (placeholders.length > 0) {
      record('FAIL', 'config', `placeholder values in .env: ${placeholders.join(', ')}`);
    }

    const missingRelease = RELEASE_PUBLIC_ENV.filter((name) => !vars.get(name));
    if (missingRelease.length > 0) {
      const detail = 'DEFERRED_UNTIL_PAID_LAUNCH: the production RevenueCat platform keys cannot be issued '
        + 'until the store accounts exist. Supply them as EAS environment variables, not in a committed file.';
      if (RELEASE_MODE) {
        record('FAIL', 'config', `missing release variables: ${missingRelease.join(', ')}`, detail);
      } else {
        record('DEFERRED', 'config', `release-only variables not set locally: ${missingRelease.join(', ')}`, detail);
      }
    } else {
      record('PASS', 'config', 'all client variables including RevenueCat keys are present');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. EAS project linkage (A-02)
// ─────────────────────────────────────────────────────────────────────────────

function checkEasProjectId() {
  const appJson = readIfExists('app.json');
  const appConfigTs = readIfExists('app.config.ts');
  const appConfigJs = readIfExists('app.config.js');

  const haystack = [appJson, appConfigTs, appConfigJs].filter(Boolean).join('\n');
  const hasProjectId = /projectId/.test(haystack);
  const hasOwner = /"owner"\s*:/.test(appJson ?? '') || /owner\s*:/.test(appConfigTs ?? '');

  if (hasProjectId && hasOwner) {
    record('PASS', 'release', 'EAS projectId and owner are configured');
    return;
  }

  const missing = [
    hasProjectId ? null : 'extra.eas.projectId',
    hasOwner ? null : 'owner',
  ].filter(Boolean).join(', ');

  const detail = 'DEFERRED_UNTIL_PAID_LAUNCH / DEFERRED_REMOTE_CONFIGURATION: `eas init` (or `eas project:create`) '
    + 'writes these from the Expo account. Push notification registration throws until it is set '
    + '(src/lib/notifications.ts). Do not invent a value.';
  if (RELEASE_MODE) {
    record('FAIL', 'release', `missing EAS linkage: ${missing}`, detail);
  } else {
    record('DEFERRED', 'release', `EAS linkage not set yet: ${missing}`, detail);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Store assets and template leftovers (A-05, P-06)
// ─────────────────────────────────────────────────────────────────────────────

function checkStoreAssets() {
  // Only the icon that app.json actually ships matters here: an orphaned Expo
  // icon-composer bundle left on disk must not fail the release gate.
  let activeIcon = '';
  try {
    const appConfig = readIfExists('app.json');
    const parsedConfig = appConfig ? JSON.parse(appConfig) : null;
    activeIcon = parsedConfig?.expo?.ios?.icon ?? parsedConfig?.expo?.icon ?? '';
  } catch {
    activeIcon = '';
  }

  const iconComposer = typeof activeIcon === 'string' && activeIcon.endsWith('.icon')
    ? readIfExists(`${activeIcon.replace(/^\.\//, '')}/icon.json`)
    : null;

  if (iconComposer && /expo-symbol|grid\.png/.test(iconComposer)) {
    const detail = `The icon configured in app.json (${activeIcon}) is still the Expo template composition `
      + '(layer named "expo-symbol", grid background). Replace with the Ortodoxia artwork before submission.';
    if (RELEASE_MODE) {
      record('FAIL', 'release', 'iOS app icon is still the Expo template asset', detail);
    } else {
      record('DEFERRED', 'release', 'app icon is still the Expo template asset', detail);
    }
  } else {
    record('PASS', 'release', 'iOS icon composition is not the Expo template');
  }

  const license = readIfExists('LICENSE');
  if (license && /650 Industries|Expo/.test(license)) {
    const detail = 'LICENSE still carries the Expo template copyright (650 Industries, Inc.). Set the project\'s own '
      + 'copyright holder before distributing.';
    if (RELEASE_MODE) {
      record('FAIL', 'release', 'LICENSE still attributes the Expo template', detail);
    } else {
      record('DEFERRED', 'release', 'LICENSE still attributes the Expo template', detail);
    }
  } else {
    record('PASS', 'release', 'LICENSE does not carry the Expo template attribution');
  }

  const pkg = readIfExists('package.json');
  if (pkg) {
    const parsed = JSON.parse(pkg);
    const deps = { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}) };
    if (deps['expo-dev-client'] && parsed.dependencies?.['expo-dev-client']) {
      record('FAIL', 'release', 'expo-dev-client is listed in "dependencies" and would ship in a production build');
    } else {
      record('PASS', 'release', 'expo-dev-client is not a production dependency');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Content readiness (H-03, J-01, J-03)
// ─────────────────────────────────────────────────────────────────────────────

function checkContentReadiness() {
  // daily_content: numără zilele acoperite din TOATE migrările care seamănă conținut zilnic
  // (nu doar fișierul inițial): generatorul din Jaguar scrie migrări separate, pe zile.
  const migrationsDir = 'supabase/migrations';
  const seedFiles = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((name) => /daily_content/i.test(name) && name.endsWith('.sql'))
    : [];
  const seededDays = new Set();
  for (const name of seedFiles) {
    const seed = readIfExists(`${migrationsDir}/${name}`) ?? '';
    for (const match of seed.matchAll(/'(2026-\d{2}-\d{2})'/g)) seededDays.add(match[1]);
  }
  if (seededDays.size >= 365) {
    record('PASS', 'content', `daily_content covers ${seededDays.size} day(s)`);
  } else {
    const detail = 'BLOCKED_MISSING_SOURCE_DATA: the repository holds no 365-day corpus. The Home screen falls back to '
      + 'localized fallback copy and the daily notification sends a generic verse. Do not fabricate liturgical content '
      + 'to fill the gap — import the reviewed corpus, then re-run this check.';
    if (RELEASE_MODE) {
      record('FAIL', 'content', `daily_content covers only ${seededDays.size} day(s) of 365`, detail);
    } else {
      record('DEFERRED', 'content', `daily_content covers only ${seededDays.size} day(s) — Home shows fallback copy`, detail);
    }
  }

  // bible_verses: verify the app has a documented export/import path rather than
  // silently depending on remote-only data.
  const hasExportTooling = existsSync(join(ROOT, 'scripts', 'bible-corpus-export.mjs'))
    && readIfExists('docs/BIBLE_CORPUS_PIPELINE.md') !== null;
  if (hasExportTooling) {
    record('PASS', 'content', 'a Bible corpus export/import path is documented and present');
  } else {
    record(
      'DEFERRED',
      'content',
      'Bible verses live only in the remote database; no local corpus or export tooling',
      'BLOCKED_MISSING_SOURCE_DATA: docs/BIBLE_CONTENT_STATUS.md states the 7,958 verses exist only in Supabase. '
      + 'A seed migration cannot be written without the corpus. The app degrades to an explicit empty state.',
    );
  }

  // prayer audio: the app must not claim an MP3 exists unless a path is set.
  const audioMigration = readIfExists('supabase/migrations/20260831000300_add_prayer_audio.sql') ?? '';
  const updatesAudioPath = /update\s+public\.prayers[\s\S]*?audio_path\s*=/i.test(audioMigration);
  const hasAudioMigrations = existsSync(join(ROOT, 'supabase', 'migrations'));
  if (updatesAudioPath) {
    record('PASS', 'content', 'prayer audio paths are seeded by a migration');
  } else if (hasAudioMigrations) {
    record(
      'DEFERRED',
      'content',
      'no migration sets prayers.audio_path — the audio button falls back to on-device speech',
      'BLOCKED_MISSING_SOURCE_DATA: the reviewed MP3 files are not in the repository, so audio_path cannot be set. '
      + 'The UI already falls back to device text-to-speech and reports failures honestly.',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Calendar coverage (H-06)
// ─────────────────────────────────────────────────────────────────────────────

function checkCalendarCoverage() {
  const dir = join(ROOT, 'supabase', 'migrations');
  if (!existsSync(dir)) {
    record('FAIL', 'calendar', 'supabase/migrations is missing');
    return;
  }
  const files = readdirSync(dir).filter((name) => /calendar/.test(name) && name.endsWith('.sql'));

  const years = new Set();
  for (const name of files) {
    const content = readFileSync(join(dir, name), 'utf8');
    for (const match of content.matchAll(/'(20\d{2})-\d{2}-\d{2}'/g)) years.add(match[1]);
  }

  const sorted = [...years].sort();
  if (sorted.length === 0) {
    record('FAIL', 'calendar', 'no calendar year found in the seed migrations');
    return;
  }

  const currentYear = new Date().getUTCFullYear();
  if (sorted.includes(String(currentYear + 1))) {
    record('PASS', 'calendar', `calendar data covers ${sorted.join(', ')}`);
  } else {
    record(
      'DEFERRED',
      'calendar',
      `calendar data covers only ${sorted.join(', ')} — no rows for ${currentYear + 1}`,
      'BLOCKED_MISSING_SOURCE_DATA: the 2027 liturgical calendars are not published yet. The UI clamps month '
      + 'navigation to the seeded range and shows an explicit, localized empty state instead of an empty grid.',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Test wiring (M-01)
// ─────────────────────────────────────────────────────────────────────────────

function checkTestWiring() {
  const pkgRaw = readIfExists('package.json');
  if (!pkgRaw) {
    record('FAIL', 'tests', 'package.json is missing');
    return;
  }
  const pkg = JSON.parse(pkgRaw);
  const scripts = pkg.scripts ?? {};

  const required = ['test', 'typecheck', 'typecheck:edge'];
  const missing = required.filter((name) => !scripts[name]);
  if (missing.length > 0) {
    record('FAIL', 'tests', `package.json is missing script(s): ${missing.join(', ')}`);
  } else {
    record('PASS', 'tests', `npm scripts present: ${required.join(', ')}`);
  }

  const ciPath = '.github/workflows/ci.yml';
  if (existsSync(join(ROOT, ciPath))) {
    record('PASS', 'tests', `${ciPath} exists`);
  } else {
    record('FAIL', 'tests', `${ciPath} is missing — nothing gates the suite automatically`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Secret hygiene (O-*)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Credential detection patterns.
 *
 * These must match *values*, not identifiers. A first draft matched the bare word
 * `service_role` and produced dozens of false positives, because Edge Functions and
 * documentation legitimately name the role. Each pattern below therefore targets
 * something that can only be a credential.
 */
const SECRET_PATTERNS = [
  { name: 'OpenAI API key', pattern: /sk-(proj-)?[A-Za-z0-9_-]{24,}/ },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{30,}/ },
  { name: 'private key block', pattern: /BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY/ },
  { name: 'hardcoded JWT', pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Stripe live secret', pattern: /sk_live_[A-Za-z0-9]{20,}/ },
  {
    // A privileged key can only reach the client bundle through an EXPO_PUBLIC_*
    // variable, so this is the precise signal for client-side leakage.
    name: 'privileged key exposed via EXPO_PUBLIC_',
    pattern: /EXPO_PUBLIC_[A-Z_]*(SERVICE_ROLE|SECRET)/i,
  },
];

const SECRET_SCAN_SKIP = new Set([
  'package-lock.json',
  'LICENSE',
  'README.md',
  // The checker documents the patterns it looks for and would match itself.
  'release-readiness.mjs',
]);

/** Documentation legitimately names credential variables; only code is scanned. */
const SECRET_SCAN_SKIP_DIRS = new Set(['docs']);

function checkSecretHygiene() {
  const findings = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', '.expo', 'dist', 'work', 'android', 'ios', '.npm-cache'].includes(entry.name)) continue;
      if (SECRET_SCAN_SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|cjs|json|sql|toml|yml|yaml|md)$/.test(entry.name)) continue;
      if (SECRET_SCAN_SKIP.has(entry.name)) continue;
      const content = readFileSync(full, 'utf8');
      for (const { name, pattern } of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          findings.push(`${relative(ROOT, full).replace(/\\/g, '/')}: possible ${name}`);
        }
      }
    }
  }

  walk(ROOT);

  if (findings.length === 0) {
    record('PASS', 'security', 'no hardcoded credential pattern found in the tracked tree');
  } else {
    record('FAIL', 'security', `${findings.length} possible credential(s) in source`, findings.slice(0, 8).join('; '));
  }

  // .env must never be tracked.
  const gitignore = readIfExists('.gitignore') ?? '';
  if (/^\.env$/m.test(gitignore)) {
    record('PASS', 'security', '.env is git-ignored');
  } else {
    record('FAIL', 'security', '.env is not listed in .gitignore');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. i18n integrity
// ─────────────────────────────────────────────────────────────────────────────

function checkI18n() {
  const config = readIfExists('src/i18n/config.ts');
  if (!config) {
    record('FAIL', 'i18n', 'src/i18n/config.ts is missing');
    return;
  }

  const blocks = [...config.matchAll(/^const (ro|en|el|sr|bg|mk|uk|ka|ru|sq) = \{$/gm)];
  if (blocks.length !== 10) {
    record('FAIL', 'i18n', `expected 10 locale blocks, found ${blocks.length}`);
    return;
  }

  // Canonical rank + location keys must exist in every locale.
  const requiredKeys = [
    'calendar.rankRedCross',
    'calendar.rankBlackCross',
    'calendar.rankGreatFeast',
    'calendar.rankTheotokosFeast',
    'calendar.rankSunday',
    'location.bucharest',
    'location.kyiv',
  ];
  const missing = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const locale = blocks[i][1];
    const start = blocks[i].index;
    const end = i + 1 < blocks.length ? blocks[i + 1].index : config.length;
    const body = config.slice(start, end);
    for (const key of requiredKeys) {
      if (!body.includes(`'${key}'`)) missing.push(`${locale}:${key}`);
    }
  }

  if (missing.length === 0) {
    record('PASS', 'i18n', 'canonical rank and location keys exist in all 10 locales');
  } else {
    record('FAIL', 'i18n', `${missing.length} missing required key(s)`, missing.slice(0, 8).join(', '));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Accessibility (a quality gate, decidable from the source)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Accessibility is the one quality item on the improvement list that is entirely
 * decidable from the source, so it is a gate rather than a checklist entry. The check
 * shells out to the audit script instead of re-implementing its rules: two copies of
 * the same rule is how they drift apart.
 *
 * The audit covers control roles and labels, input labels, decorative images, the 44pt
 * touch target, WCAG AA contrast and hardcoded copy. It runs in under a second with no
 * bundler and no network, so it is cheap enough for every run of this gate.
 */
function checkAccessibility() {
  const scriptPath = join(ROOT, 'scripts', 'accessibility-audit.mjs');
  if (!existsSync(scriptPath)) {
    record('FAIL', 'a11y', 'scripts/accessibility-audit.mjs is missing — accessibility is unchecked');
    return;
  }
  const result = spawnSync(process.execPath, [scriptPath], { cwd: ROOT, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.status === 0) {
    const summary = /(\d+) source file\(s\) scanned/.exec(output);
    record('PASS', 'a11y', `accessibility audit is clean${summary ? ` across ${summary[1]} source file(s)` : ''}`);
    return;
  }
  const count = /(\d+) finding\(s\)/.exec(output);
  const examples = output.split('\n').filter((line) => /^\s{6}\S/.test(line)).slice(0, 3);
  record(
    'FAIL',
    'a11y',
    `accessibility audit reported ${count ? count[1] : 'unknown'} finding(s)`,
    examples.length > 0 ? `examples: ${examples.map((line) => line.trim()).join(' | ')}` : undefined,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log(`Ortodoxia release readiness — ${RELEASE_MODE ? 'RELEASE mode' : 'CI mode'}`);
  console.log(RELEASE_MODE
    ? 'Checks everything, including the paid-launch inputs. Run immediately before a production build.'
    : 'Checks what must hold today. Use --release for the full pre-submission gate.');
  console.log('');

  checkLegalPlaceholders();
  checkSupportContact();
  checkEnvVariables();
  checkEasProjectId();
  checkStoreAssets();
  checkContentReadiness();
  checkCalendarCoverage();
  checkTestWiring();
  checkSecretHygiene();
  checkI18n();
  checkAccessibility();

  const order = { FAIL: 0, DEFERRED: 1, PASS: 2 };
  results.sort((a, b) => order[a.level] - order[b.level]);

  let failures = 0;
  let deferred = 0;

  for (const entry of results) {
    const tag = entry.level.padEnd(8);
    console.log(`${tag} [${entry.area}] ${entry.message}`);
    if (entry.detail) console.log(`           ${entry.detail}`);
    if (entry.level === 'FAIL') failures += 1;
    if (entry.level === 'DEFERRED') deferred += 1;
  }

  console.log('');
  console.log('──────────────────────────────────────────────────────────────');
  const passed = results.filter((entry) => entry.level === 'PASS').length;
  console.log(`passed: ${passed}   failed: ${failures}   deferred: ${deferred}`);

  if (failures > 0) {
    console.log('');
    console.log(RELEASE_MODE
      ? 'RELEASE GATE: NOT READY — resolve every FAIL above before building for the stores.'
      : 'CI GATE: FAILED — a current-code invariant is broken.');
    process.exitCode = 1;
    return;
  }

  if (RELEASE_MODE && deferred > 0) {
    console.log('');
    console.log('RELEASE GATE: NOT READY — the DEFERRED items need external input (accounts, credentials or the real data corpus).');
    console.log('They are listed above with the exact source of the missing value.');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log(RELEASE_MODE
    ? 'RELEASE GATE: READY — no placeholders, no missing credentials, no missing content.'
    : 'CI GATE: PASSED.');
}

main();
