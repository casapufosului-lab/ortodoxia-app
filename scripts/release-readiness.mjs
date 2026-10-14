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
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateStoreKeys } from './lib/store-keys.mjs';

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

// Variabilele care trebuie să existe înainte de un build de lansare pentru Google Play.
const RELEASE_PUBLIC_ENV = [
  ...REQUIRED_PUBLIC_ENV,
  'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY',
];

// Variabilele care țin exclusiv de App Store. Lansarea de față este pentru Google Play, deci lipsa lor
// se raportează ca DEFERRED, nu ca FAIL: altfel poarta ar rămâne roșie pentru o cheie care nu poate
// exista încă, iar cineva ar fi tenta să slăbească verificarea (poziția B6 din audit cere tocmai
// contrariul — un FAIL clar pe cheia de magazin goală).
const IOS_ONLY_PUBLIC_ENV = [
  'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY',
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

    // Cheile care țin doar de App Store nu blochează lansarea Google Play; rămân vizibile ca DEFERRED.
    const missingIosOnly = IOS_ONLY_PUBLIC_ENV.filter((name) => !vars.get(name));
    if (missingIosOnly.length > 0) {
      record(
        'DEFERRED',
        'config',
        `App Store-only variables not set locally: ${missingIosOnly.join(', ')}`,
        'Lansarea de față este pentru Google Play; cheia App Store se emite în contul App Store Connect '
        + 'și se completează înainte de primul build pentru iOS.',
      );
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
  // Rezolvat față de ROOT, nu față de directorul din care e rulată poarta: rulată din altă parte,
  // verificarea vedea zero migrări și raporta un FAIL fals („acoperă doar 0 zile din 365").
  const seedFiles = existsSync(join(ROOT, migrationsDir))
    ? readdirSync(join(ROOT, migrationsDir)).filter((name) => /daily_content/i.test(name) && name.endsWith('.sql'))
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

  // bible_verses: the corpus must exist locally (generated from the live database), not only remotely.
  // The exporter plus the documented pipeline are the export/import path; the seed files are the corpus.
  const hasExportTooling = existsSync(join(ROOT, 'scripts', 'bible-corpus-export.mjs'))
    && readIfExists('docs/BIBLE_CORPUS_PIPELINE.md') !== null;
  const corpusSeed = readIfExists('supabase/migrations/20260923000300_seed_bible_verses_corpus.sql');
  const seededVerses = corpusSeed === null ? 0 : Number.parseInt(/rânduri: (\d+)/.exec(corpusSeed)?.[1] ?? '0', 10);
  if (hasExportTooling && seededVerses >= 7000) {
    record('PASS', 'content', `a Bible corpus export/import path exists and ${seededVerses} verses are seeded locally`);
  } else if (hasExportTooling) {
    record(
      'DEFERRED',
      'content',
      'the export path exists but no corpus seed has been generated yet',
      'BLOCKED_MISSING_SOURCE_DATA: run `npm run content:export` with the project credentials to write the seed '
      + 'from the live database. Do not fabricate verses.',
    );
  } else {
    record(
      'DEFERRED',
      'content',
      'Bible verses live only in the remote database; no local corpus or export tooling',
      'BLOCKED_MISSING_SOURCE_DATA: docs/BIBLE_CONTENT_STATUS.md states the 7,958 verses exist only in Supabase. '
      + 'A seed migration cannot be written without the corpus. The app degrades to an explicit empty state.',
    );
  }

  // prayer audio: the app must not claim an MP3 exists unless a path is set. Any migration that seeds
  // audio_path counts — the check used to look at one hard-coded filename, so a corpus seed that does
  // exactly the right thing was reported as missing.
  // `migrationsDir` este deja declarat mai sus, în aceeași funcție (verificarea de daily_content);
  // ambele accesări sunt ancorate în ROOT, ca poarta să nu depindă de directorul de lucru.
  const hasAudioMigrations = existsSync(join(ROOT, migrationsDir));
  const audioSeeders = hasAudioMigrations
    ? readdirSync(join(ROOT, migrationsDir)).filter((name) => /\.sql$/i.test(name)).filter((name) => {
      const sql = readIfExists(join('supabase', 'migrations', name)) ?? '';
      return /audio_path/i.test(sql) && /(insert\s+into\s+public\.prayers|update\s+public\.prayers)/i.test(sql);
    })
    : [];
  const seededAudio = audioSeeders
    .map((name) => readIfExists(join('supabase', 'migrations', name)) ?? '')
    .join('\n');
  const audioPaths = (seededAudio.match(/'[^']*\.[a-z0-9]{2,4}'/gi) ?? []).length;
  if (audioPaths > 0) {
    record('PASS', 'content', `prayer audio paths are seeded by a migration (${String(audioPaths)} căi)`);
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

// ─────────────────────────────────────────────────────────────────────────────
// 7. EAS build/submit configuration (the release actually leaves through this file)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The production profile is what ships. Three things must never be true of it:
 *   - a `test_` RevenueCat key (a store build with test keys cannot sell anything —
 *     and the stores reject IAP that does not work);
 *   - a service-role key of any kind (that is a real secret, not a publishable key);
 *   - a missing `autoIncrement` (two builds would claim the same versionCode/buildNumber
 *     and the second upload is rejected by Play Console / App Store Connect).
 * The legal values and the Supabase publishable key are public by design and are checked for presence.
 */
/**
 * Path to the EAS configuration the gate reads.
 *
 * By default that is `eas.json` in the repository. The proof harness
 * (`scripts/prove-store-key-gate-fails.mjs`) needs to run the gate against a *mutated*
 * copy without ever touching the real file, so it may point `ORTODOXIA_EAS_JSON` at a
 * copy inside the system temp folder. Any other path is refused: the override must not
 * become a way to hide a missing store key from the gate.
 */
function easConfigPath() {
  const override = process.env.ORTODOXIA_EAS_JSON;
  if (!override) return join(ROOT, 'eas.json');
  const candidate = resolve(override);
  const tempRoot = resolve(tmpdir());
  if (!candidate.toLowerCase().startsWith(`${tempRoot.toLowerCase()}${sep}`)) {
    record('FAIL', 'release', 'ORTODOXIA_EAS_JSON must point inside the system temp folder', `${candidate}`);
    return null;
  }
  if (!existsSync(candidate)) {
    record('FAIL', 'release', 'ORTODOXIA_EAS_JSON points at a file that does not exist', candidate);
    return null;
  }
  return candidate;
}

function checkEasConfiguration() {
  const easPath = easConfigPath();
  if (easPath === null) return;
  let raw = null;
  try {
    raw = readFileSync(easPath, 'utf8');
  } catch {
    raw = null;
  }
  if (raw === null) {
    record('FAIL', 'release', 'eas.json is missing — no build profile exists');
    return;
  }
  let eas;
  try {
    eas = JSON.parse(raw);
  } catch (error) {
    record('FAIL', 'release', `eas.json is not valid JSON: ${String(error)}`);
    return;
  }

  const production = eas?.build?.production;
  if (production === null || production === undefined) {
    record('FAIL', 'release', 'eas.json has no production build profile');
    return;
  }
  const env = production.env ?? {};

  const required = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_LEGAL_ENTITY',
    'EXPO_PUBLIC_SUPPORT_EMAIL',
    'EXPO_PUBLIC_LEGAL_POSTAL_ADDRESS',
    'EXPO_PUBLIC_LEGAL_JURISDICTION',
    'EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE',
    'EXPO_PUBLIC_PRIVACY_POLICY_URL',
    'EXPO_PUBLIC_TERMS_URL',
  ];
  const missing = required.filter((name) => typeof env[name] !== 'string' || env[name].trim() === '');
  if (missing.length === 0) {
    record('PASS', 'release', 'the production profile supplies every public variable the app needs');
  } else if (RELEASE_MODE) {
    record('FAIL', 'release', `production profile is missing: ${missing.join(', ')}`);
  } else {
    record('DEFERRED', 'release', `production profile is missing: ${missing.join(', ')}`);
  }

  // Cheile de Test Store (`test_…`) omoară procesul în build-ul de release („Wrong API Key … The app
  // will close now"), deci sunt raportate separat și tare. Cazul „cheie declarată, dar goală sau
  // placeholder" este tratat imediat mai jos (poziția B6), cu decizia din scripts/lib/store-keys.mjs.
  const testKeys = Object.entries(env)
    .filter(([name, value]) => /REVENUECAT/.test(name) && typeof value === 'string' && value.startsWith('test_'))
    .map(([name]) => name);
  if (testKeys.length === 0) {
    record('PASS', 'release', 'no RevenueCat test key is shipped by the production profile');
  } else {
    // This is deliberately loud: a store build with a test key cannot take a payment.
    record(
      RELEASE_MODE ? 'FAIL' : 'DEFERRED',
      'release',
      `production profile still ships a RevenueCat TEST key: ${testKeys.join(', ')}`,
      'BLOCKED_MISSING_SOURCE_DATA: the platform keys are issued per store account. Replace them with the live '
      + 'public SDK keys (EAS environment variables) before building for the stores.',
    );
  }

  // Poziția A4 + B6 din audit.
  //
  // Golul era cel mai scump caz și singurul pe care poarta nu îl prindea: `eas.json` declara
  // `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: ""`, iar verificarea de mai sus reacționează doar la
  // cheile care încep cu `test_`. Rezultatul: un build care pornește, afișează „prețul se vede în
  // magazin" și în care nimeni nu poate cumpăra nimic — iar poarta spunea PASS.
  //
  // De ce o cheie goală chiar strică build-ul: `env` din profilul EAS are prioritate față de
  // variabilele de mediu EAS, deci un șir gol aici NU poate fi completat din exterior.
  //
  // Decizia „poate vinde sau nu" stă în `scripts/lib/store-keys.mjs` (funcție pură, testată
  // executând codul — vezi tests/release-store-keys.test.mjs), ca poarta să nu aibă o a doua
  // regulă paralelă care poate rămâne în urmă.
  const storeKeys = evaluateStoreKeys(env);
  const requiredStoreKeys = storeKeys.filter((entry) => entry.requiredForThisLaunch);
  const unusableRequired = requiredStoreKeys.filter((entry) => !entry.usable);

  if (unusableRequired.length === 0) {
    const platforms = requiredStoreKeys.map((entry) => entry.store).join(', ');
    record('PASS', 'release', `the production profile carries a usable store key (${platforms})`);
  } else {
    const names = unusableRequired.map((entry) => entry.name).join(', ');
    const detail = 'Cheia publică a magazinului lipsește, e goală sau e un placeholder — un build cu ea '
      + 'așa nu poate lua nicio plată. Frânghia de salvare: un șir gol pus aici are prioritate '
      + 'față de variabilele de mediu EAS și ajunge exact așa în bundle. '
      + 'Este o cheie PUBLICĂ (goog_…), nu un secret: se completează în profilul production din eas.json '
      + '(poarta citește doar fișierele din depozit, nu variabilele de mediu EAS ale proiectului). '
      + 'BLOCKED_MISSING_SOURCE_DATA: cheia se emite în contul de Play Console, deci o pune ownerul.';
    record(RELEASE_MODE ? 'FAIL' : 'DEFERRED', 'release', `the production profile cannot sell anything: ${names}`, detail);
  }

  // Magazinul care nu face parte din lansarea de față (App Store) rămâne vizibil, dar nu blochează
  // build-ul Android: un FAIL pentru o cheie care nu poate exista încă ar face poarta imposibil de
  // trecut și ar împinge la slăbirea altor verificări.
  const unusableOptional = storeKeys.filter((entry) => !entry.requiredForThisLaunch && !entry.usable);
  if (unusableOptional.length > 0) {
    const names = unusableOptional.map((entry) => `${entry.name} (${entry.store})`).join(', ');
    record(
      'DEFERRED',
      'release',
      `store key(s) outside this launch are still unset: ${names}`,
      'Lansarea de față este pentru Google Play. Cheia App Store se emite în contul App Store Connect '
      + 'și se completează înainte de primul build pentru iOS. Nu blochează build-ul Android.',
    );
  }

  const secretNames = Object.keys(env).filter((name) => /SERVICE_ROLE|SECRET|_TOKEN$/.test(name));
  if (secretNames.length === 0) {
    record('PASS', 'release', 'the production profile carries no server-only secret');
  } else {
    record('FAIL', 'release', `production profile exposes server-only values: ${secretNames.join(', ')}`);
  }

  if (production.autoIncrement === true) {
    record('PASS', 'release', 'the production profile increments the build number automatically');
  } else {
    record(
      RELEASE_MODE ? 'FAIL' : 'DEFERRED',
      'release',
      'production profile has no autoIncrement: a second upload would reuse the same version',
      'Set "autoIncrement": true in eas.json so buildNumber/versionCode advance on every production build.',
    );
  }

  // Public values are repeated in every profile (EAS injects only the selected profile's env). That is
  // safe only while the copies agree: a Supabase URL that differs between preview and production is a bug
  // that would show up on a device, not in the repository.
  const profiles = Object.entries(eas?.build ?? {});
  const seenValues = new Map();
  const conflicts = [];
  for (const [profileName, profile] of profiles) {
    for (const [name, value] of Object.entries(profile?.env ?? {})) {
      if (!name.startsWith('EXPO_PUBLIC_')) continue;
      const previous = seenValues.get(name);
      if (previous === undefined) {
        seenValues.set(name, { profile: profileName, value });
        continue;
      }
      // Cheile RevenueCat diferă prin definiție între profile (test în preview, live în producție).
      if (name === 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY' || name === 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY') continue;
      if (previous.value !== value) conflicts.push(`${name} (${previous.profile} vs ${profileName})`);
    }
  }
  if (conflicts.length === 0) {
    record('PASS', 'release', `public values agree across ${String(profiles.length)} build profiles`);
  } else {
    record('FAIL', 'release', `public values differ between profiles: ${conflicts.join(', ')}`);
  }

  // The iOS permission messages exist in two places (app.json infoPlist and the speech plugin).
  // Two sources of truth drift; the strings must stay identical.
  const appJson = readIfExists('app.json');
  if (appJson !== null) {
    let app;
    try {
      app = JSON.parse(appJson);
    } catch {
      app = null;
    }
    const infoPlist = app?.expo?.ios?.infoPlist ?? {};
    const plugin = (app?.expo?.plugins ?? []).find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-speech-recognition',
    );
    const pluginConfig = Array.isArray(plugin) ? plugin[1] ?? {} : {};
    const pairs = [
      ['NSSpeechRecognitionUsageDescription', 'speechRecognitionPermission'],
      ['NSMicrophoneUsageDescription', 'microphonePermission'],
    ];
    const drift = pairs.filter(([plistKey, pluginKey]) =>
      typeof infoPlist[plistKey] === 'string'
      && typeof pluginConfig[pluginKey] === 'string'
      && infoPlist[plistKey] !== pluginConfig[pluginKey]);
    if (drift.length === 0) {
      record('PASS', 'release', 'the iOS permission messages agree with the speech plugin');
    } else {
      record('FAIL', 'release', `iOS permission messages drifted: ${drift.map(([key]) => key).join(', ')}`);
    }
  }
}

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

/**
 * Exceptii JUSTIFICATE, cu dovada masurata (nu presupuse).
 *
 * `google-services.json` (in radacina si in android/app/): singura valoare de tip
 * AIza… din fisier este `client[0].api_key[0].current_key` - cheia de CLIENT
 * Android (39 de caractere), pe care Firebase o cere prin constructie si care
 * ajunge oricum, in clar, in APK-ul publicat. Nu este un secret: singura ei
 * protectie reala este restrictia de pachet (`ro.ortodoxia.app`) plus amprenta
 * SHA-1, setate in consola Google Cloud. Fisierul este cerut explicit de
 * `app.json` (vezi si testul "Firebase config" de mai jos), deci stergerea lui ar
 * rupe aplicatia, nu ar repara poarta.
 *
 * Exceptia este TINTA: se excepteaza doar tiparul "Google API key" pentru acest
 * fisier. Orice alt tipar (cheie privata, JWT, sk_live_, sk-, EXPO_PUBLIC_*SECRET)
 * ramane activ in el.
 */
const SECRET_PATTERN_ALLOWLIST = [
  { file: 'google-services.json', pattern: 'Google API key' },
  { file: 'android/app/google-services.json', pattern: 'Google API key' },
];

function checkSecretHygiene() {
  const findings = [];
  const exceptate = [];

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
          const rel = relative(ROOT, full).replace(/\\/g, '/');
          const exceptat = SECRET_PATTERN_ALLOWLIST.some((e) => e.file === rel && e.pattern === name);
          if (exceptat) {
            exceptate.push(`${rel}: ${name} (cheie de client, publica prin constructie)`);
            continue;
          }
          findings.push(`${rel}: possible ${name}`);
        }
      }
    }
  }

  walk(ROOT);

  if (findings.length === 0) {
    record(
      'PASS',
      'security',
      'no hardcoded credential pattern found in the tracked tree' +
        (exceptate.length ? ` (exceptii justificate: ${exceptate.join('; ')})` : ''),
    );
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
 * Poziția A8 din audit: listarea promite „Notificări la ora pe care o alegi", dar pe Android
 * canalul nu poate exista fără configurația Firebase.
 *
 * Ce se verifică aici, din depozit: există un `google-services.json` și îl indică `app.json`;
 * există scriptul de cron; `expo-notifications` e declarat. Ce NU se poate verifica din depozit —
 * că scriptul de cron chiar a fost rulat pe proiect — rămâne treaba ownerului și e scris în
 * docs/CRON-NOTIFICARI.md.
 */
function checkPushNotifications() {
  const candidates = ['google-services.json', 'android/app/google-services.json'];
  const present = candidates.find((relPath) => existsSync(join(ROOT, relPath)));

  const appJson = readIfExists('app.json');
  let configuredPath = null;
  if (appJson !== null) {
    try {
      configuredPath = JSON.parse(appJson)?.expo?.android?.googleServicesFile ?? null;
    } catch {
      configuredPath = null;
    }
  }

  const cronScript = existsSync(join(ROOT, 'supabase', 'cron', 'schedule-daily-notifications.sql'));
  const dependency = readIfExists('package.json')?.includes('"expo-notifications"') ?? false;

  if (!present || !configuredPath || !cronScript || !dependency) {
    const missing = [];
    if (!dependency) missing.push('expo-notifications is not a dependency');
    if (!present) missing.push('no google-services.json in the project');
    if (!configuredPath) missing.push('app.json does not set expo.android.googleServicesFile');
    if (!cronScript) missing.push('supabase/cron/schedule-daily-notifications.sql is missing');
    record(
      RELEASE_MODE ? 'FAIL' : 'DEFERRED',
      'release',
      `the listing promises notifications, but the push channel cannot work: ${missing.join('; ')}`,
      'Pune google-services.json (Firebase → aplicația Android ro.ortodoxia.app), indică-l în app.json '
      + 'și pornește cron-ul din supabase/cron/schedule-daily-notifications.sql — pașii sunt în '
      + 'docs/CRON-NOTIFICARI.md. Alternativa, dacă notificările nu se lansează acum: scoate promisiunea '
      + 'din descrierea listării (docs/STORE_SUBMISSION_KIT.md).',
    );
    return;
  }

  record('PASS', 'release', 'the push notification channel is configured (Firebase file, app.json, cron script)');
}

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

/**
 * A9 + A10 (audit): native hardening must survive `expo prebuild`.
 *
 * `android/` is git-ignored, so every badge-permission removal, the cleartext switch, the
 * notification icon and the release signing config live in `app.json` + `plugins/` only. If the
 * plugin stops being wired, the next prebuild (local or EAS) silently restores the template
 * manifest and a debug-signed release build. This check fails loudly instead.
 */
function checkAndroidNativeHardening() {
  const pluginPath = join(ROOT, 'plugins', 'with-android-hardening.js');
  if (!existsSync(pluginPath)) {
    record('FAIL', 'android', 'plugins/with-android-hardening.js is missing — prebuild would lose the native hardening');
    return;
  }

  const appJson = readIfExists('app.json');
  if (!appJson || !appJson.includes('./plugins/with-android-hardening')) {
    record('FAIL', 'android', 'app.json does not load ./plugins/with-android-hardening');
    return;
  }

  const gradle = readIfExists('android/app/build.gradle');
  const manifest = readIfExists('android/app/src/main/AndroidManifest.xml');
  if (gradle === null && manifest === null) {
    record('PASS', 'android', 'hardening plugin is wired (no android/ folder present — EAS regenerates it)');
    return;
  }

  const stale = [];
  if (gradle !== null && !gradle.includes('A9: NICIODATĂ keystore-ul de debug')) {
    stale.push('android/app/build.gradle still allows the debug keystore for release');
  }
  if (manifest !== null && !/android:usesCleartextTraffic="false"/.test(manifest)) {
    stale.push('android/app/src/main/AndroidManifest.xml does not disable cleartext traffic');
  }
  if (manifest !== null && !/READ_APP_BADGE"[^>]*tools:node="remove"/.test(manifest)) {
    stale.push('android/app/src/main/AndroidManifest.xml no longer removes the badge permissions');
  }

  if (stale.length > 0) {
    record(
      'FAIL',
      'android',
      `native folder is stale: ${stale.join('; ')}`,
      'run `npx expo prebuild -p android --no-install` to regenerate it from app.json',
    );
    return;
  }
  record('PASS', 'android', 'native folder carries the hardening plugin output (badge permissions, cleartext, release signing)');
}

/**
 * B11 (audit): the app publishes prayer texts, generated audio and Bible text with no written
 * record of the rights to do so. `docs/LICENTE-CONTINUT.md` is that record; this check keeps it
 * from being quietly emptied before a paid launch.
 *
 * The document is data, not prose: the registry table must still carry every content class, and
 * the status column must be one of the two declared values. A class still marked NEVERIFICAT, or
 * an unchecked owner declaration, is a release blocker (a deferred item outside release mode, so
 * the everyday gate stays green while the gap stays visible).
 */
function checkContentLicences() {
  const doc = readIfExists('docs/LICENTE-CONTINUT.md');
  if (doc === null) {
    record('FAIL', 'licences', 'docs/LICENTE-CONTINUT.md is missing — no written basis for the published content');
    return;
  }

  const REQUIRED_CLASSES = ['biblie', 'rugaciuni-text', 'rugaciuni-audio', 'ai-chat', 'live-youtube', 'imagini-marci'];
  const rows = new Map();
  for (const line of doc.split(/\r?\n/)) {
    const match = /^\|\s*`([a-z-]+)`\s*\|/.exec(line);
    if (!match) continue;
    const status = /DOCUMENTAT/.test(line) ? 'DOCUMENTAT' : /NEVERIFICAT/.test(line) ? 'NEVERIFICAT' : null;
    rows.set(match[1], status);
  }

  const missing = REQUIRED_CLASSES.filter((name) => !rows.has(name));
  const malformed = REQUIRED_CLASSES.filter((name) => rows.get(name) === null);
  const unverified = REQUIRED_CLASSES.filter((name) => rows.get(name) === 'NEVERIFICAT');
  const openDeclarations = doc.split(/\r?\n/).filter((line) => /^-\s*\[ \]/.test(line.trim())).length;

  if (missing.length > 0 || malformed.length > 0) {
    record(
      'FAIL',
      'licences',
      `docs/LICENTE-CONTINUT.md is incomplete: ${[
        missing.length > 0 ? `missing class(es) ${missing.join(', ')}` : '',
        malformed.length > 0 ? `status is neither DOCUMENTAT nor NEVERIFICAT for ${malformed.join(', ')}` : '',
      ].filter(Boolean).join('; ')}`,
    );
    return;
  }

  if (unverified.length > 0 || openDeclarations > 0) {
    record(
      RELEASE_MODE ? 'FAIL' : 'DEFERRED',
      'licences',
      `content rights are only partly documented: ${unverified.length} class(es) NEVERIFICAT`
      + `${unverified.length > 0 ? ` (${unverified.join(', ')})` : ''}, ${openDeclarations} owner declaration(s) unanswered`,
      'Complete the registry table and the "Declaratii necesare de la owner" list in docs/LICENTE-CONTINUT.md.',
    );
    return;
  }

  record('PASS', 'licences', `every content class has a documented rights basis (${REQUIRED_CLASSES.length} classes)`);
}

/**
 * A11: the same processing is described in three places — the store's Data safety form, the
 * in-app policy and the published page — and the audit found the push token declared in the
 * app but missing from the submission form. One copy is outside this repository, so this check
 * pins the two that are inside it (the submission kit table and the in-app policy text) and the
 * remedy names the page that must be regenerated from them.
 *
 * Measured 2026-10-08: the string `privacy.s2_5Content` mentions the token in 9 of the 10
 * locales; Ukrainian names it in Cyrillic, which is why the floor is 9 and not 10.
 */
function checkDataSafetyAlignment() {
  const kit = readIfExists('docs/STORE_SUBMISSION_KIT.md');
  const i18nText = readIfExists('src/i18n/config.ts');

  if (kit === null || i18nText === null) {
    record('FAIL', 'legal', 'the text that describes data collection is missing (submission kit or i18n corpus)');
    return;
  }

  const sectionStart = kit.indexOf('## 4.');
  const sectionEnd = kit.indexOf('## 5.');
  const dataSafety = sectionStart === -1 ? kit : kit.slice(sectionStart, sectionEnd === -1 ? undefined : sectionEnd);

  const MIN_PUSH_TOKEN_LOCALES = 9;
  const pushMentions = (i18nText.match(/Push Token/gi) ?? []).length;

  const gaps = [];
  if (!/Expo Push Token/i.test(dataSafety)) gaps.push('the Data safety table does not declare the Expo Push Token');
  if (!/livrarea notific/i.test(dataSafety)) gaps.push('the Data safety table does not list notifications as a purpose');
  if (pushMentions < MIN_PUSH_TOKEN_LOCALES) {
    gaps.push(`the in-app policy declares the token in only ${pushMentions} locale(s)`);
  }

  if (gaps.length > 0) {
    record(
      RELEASE_MODE ? 'FAIL' : 'DEFERRED',
      'legal',
      `the app collects a notification token, but a declaration misses it: ${gaps.join('; ')}`,
      'Actualizează ambele texte, apoi regenerează pagina publicată https://ortodoxia.web.app/privacy '
      + '(proiectul de site), ca toate trei să spună același lucru.',
    );
    return;
  }

  record(
    'PASS',
    'legal',
    `the Data safety form and the in-app policy both declare the push token and the notification purpose (${pushMentions} locales)`,
  );
}

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
  checkEasConfiguration();
  checkContentReadiness();
  checkCalendarCoverage();
  checkTestWiring();
  checkSecretHygiene();
  checkI18n();
  checkAccessibility();
  checkPushNotifications();
  checkAndroidNativeHardening();
  checkContentLicences();
  checkDataSafetyAlignment();

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
