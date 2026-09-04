import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// STRUCTURAL TEST ONLY
// These tests verify that the Moldova calendar unavailable mechanism exists in source.
// They do NOT execute React components or test runtime behavior.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const configSrc = readFileSync(join(root, 'src', 'i18n', 'config.ts'), 'utf8');
const calendarSrc = readFileSync(join(root, 'src', 'app', '(tabs)', 'calendar.tsx'), 'utf8');
const indexSrc = readFileSync(join(root, 'src', 'app', '(tabs)', 'index.tsx'), 'utf8');
const providerSrc = readFileSync(join(root, 'src', 'providers', 'localization-provider.tsx'), 'utf8');

// ── 1. Moldova cannot use RO calendar fallback ──────────────────────────

test('calendar.tsx: MD guard returns before any Supabase query', () => {
  const loadStart = calendarSrc.indexOf('const loadCalendar = useCallback(async () => {');
  assert.ok(loadStart !== -1, 'loadCalendar must exist');
  const mdGuard = calendarSrc.indexOf("if (countryCode === 'MD')", loadStart);
  assert.ok(mdGuard !== -1, 'MD guard must exist in loadCalendar');
  const noCalendarGuard = calendarSrc.indexOf('if (!calendarCode)', mdGuard);
  assert.ok(noCalendarGuard !== -1, '!calendarCode guard must exist');
  assert.ok(mdGuard < noCalendarGuard, 'MD guard must be before !calendarCode guard');
  const mdBlock = calendarSrc.slice(mdGuard, calendarSrc.indexOf('}', calendarSrc.indexOf('return', mdGuard)) + 1);
  assert.ok(mdBlock.includes('setEntries([])'), 'MD guard must clear entries');
  assert.ok(mdBlock.includes('setIsLoading(false)'), 'MD guard must clear loading');
  assert.ok(mdBlock.includes('return;'), 'MD guard must return early');
});

test('calendar.tsx: legacy RO fallback still requires countryCode RO', () => {
  assert.ok(calendarSrc.includes("localizationSchemaMissing && countryCode === 'RO'"),
    'legacy fallback must be gated on countryCode RO');
});

test('index.tsx: legacy RO fallback still requires countryCode RO', () => {
  assert.ok(indexSrc.includes("localizationSchemaMissing && countryCode === 'RO'"),
    'legacy fallback must be gated on countryCode RO');
});

// ── 2. Moldova calendar is marked unavailable ───────────────────────────

test('calendar.tsx: MD renders unavailable card instead of choose-calendar card', () => {
  const mdCard = calendarSrc.indexOf("countryCode === 'MD'");
  assert.ok(mdCard !== -1, 'MD card condition must exist in render');
  const chooseCalendar = calendarSrc.indexOf('!calendarCode ?', mdCard);
  assert.ok(chooseCalendar !== -1, '!calendarCode check must exist');
  assert.ok(mdCard < chooseCalendar, 'MD card must render before choose-calendar card');
});

test('calendar.tsx: MD unavailable card contains the unavailable message key', () => {
  assert.ok(calendarSrc.includes("calendar.moldovaUnavailable"),
    'must use calendar.moldovaUnavailable translation key');
});

test('config.ts: calendar.moldovaUnavailable translation exists with correct text', () => {
  assert.ok(configSrc.includes("'calendar.moldovaUnavailable':"),
    'translation key must exist');
  assert.ok(configSrc.includes('Calendarul ortodox pentru Republica Moldova nu este disponibil momentan.'),
    'translation must contain the required Romanian message');
});

// ── 3. Romania calendar remains available ───────────────────────────────

test('config.ts: RO default calendar is not null', () => {
  assert.ok(configSrc.includes("if (countryCode === 'MD') return null;"),
    'MD must explicitly return null for default calendar');
  assert.ok(configSrc.includes("return getCalendarsForCountry(countryCode)[0] ?? null;"),
    'non-MD countries must return first available calendar');
});

test('config.ts: ro-bor calendar option exists', () => {
  assert.ok(configSrc.includes("calendarCode: 'ro-bor'"),
    'ro-bor calendar must exist');
});

test('config.ts: SUPPORTED_REGIONS includes both RO and MD', () => {
  assert.ok(configSrc.includes("countryCode: 'RO'"), 'RO must be in SUPPORTED_REGIONS');
  assert.ok(configSrc.includes("countryCode: 'MD'"), 'MD must be in SUPPORTED_REGIONS');
});

// ── 4. Calendar query is not made with RO values when MD is selected ────

test('calendar.tsx: loadCalendar early-returns for MD before any Supabase call', () => {
  const mdGuardIdx = calendarSrc.indexOf("if (countryCode === 'MD')", calendarSrc.indexOf('const loadCalendar'));
  assert.ok(mdGuardIdx !== -1, 'MD guard must exist');
  const supabaseIdx = calendarSrc.indexOf(".from('calendar_days')", mdGuardIdx);
  assert.ok(supabaseIdx !== -1, 'Supabase query must exist');
  assert.ok(mdGuardIdx < supabaseIdx, 'MD guard must be before Supabase calendar_days query');
});

test('index.tsx: home calendar query does not reach Supabase for MD (no calendarCode)', () => {
  const noCalendarGuard = indexSrc.indexOf('if (!calendarCode)');
  assert.ok(noCalendarGuard !== -1, '!calendarCode guard must exist in loadHome');
  const calendarQuery = indexSrc.indexOf(".from('calendar_days')");
  assert.ok(calendarQuery > noCalendarGuard, 'calendar_days query must be after !calendarCode guard');
});

// ── 5. Home does not expose RO calendar content for MD ──────────────────

test('index.tsx: calendar section is suppressed for MD via countryCode guard', () => {
  const calendarSection = indexSrc.indexOf("Astăzi în calendar");
  assert.ok(calendarSection !== -1, 'calendar section title must exist');
  const mdGuard = indexSrc.lastIndexOf("countryCode !== 'MD'", calendarSection);
  assert.ok(mdGuard !== -1, 'countryCode !== MD guard must wrap calendar section');
  assert.ok(mdGuard < calendarSection, 'MD guard must appear before calendar section title');
});

test('index.tsx: MD notice card is still rendered for MD', () => {
  assert.ok(indexSrc.includes("countryCode === 'MD'"),
    'MD notice card condition must still exist on Home');
});

// ── 6. Other country behavior is unchanged structurally ─────────────────

test('calendar.tsx: non-MD countries still follow !calendarCode → choose-calendar flow', () => {
  const mdGuardIdx = calendarSrc.indexOf("countryCode === 'MD'");
  const chooseCalendarIdx = calendarSrc.indexOf('!calendarCode ?', mdGuardIdx);
  assert.ok(chooseCalendarIdx !== -1, '!calendarCode choose-calendar must still exist');
  assert.ok(calendarSrc.includes('label="Alege calendarul"', chooseCalendarIdx),
    'Alege calendarul button must still be in choose-calendar card');
});

test('config.ts: CALENDAR_OPTIONS still includes ro-bor, md-basarabia, md-chisinau', () => {
  assert.ok(configSrc.includes("'ro-bor'"), 'ro-bor must remain in CALENDAR_OPTIONS');
  assert.ok(configSrc.includes("'md-basarabia'"), 'md-basarabia must remain in CALENDAR_OPTIONS');
  assert.ok(configSrc.includes("'md-chisinau'"), 'md-chisinau must remain in CALENDAR_OPTIONS');
});

// ── 7. Explicit Moldova unavailable message/state exists ─────────────────

test('calendar.tsx: MD unavailable card shows "Calendar indisponibil" title', () => {
  const mdCardIdx = calendarSrc.indexOf("countryCode === 'MD'");
  assert.ok(mdCardIdx !== -1, 'MD condition must exist');
  assert.ok(calendarSrc.indexOf('Calendar indisponibil', mdCardIdx) !== -1,
    'MD card must show Calendar indisponibil');
});

test('index.tsx: Home has existing MD-specific notice mechanism', () => {
  assert.ok(indexSrc.includes("region.moldovaCalendarPending"),
    'Home must reference moldovaCalendarPending translation');
  assert.ok(indexSrc.includes("region.moldovaChooseCalendar"),
    'Home must reference moldovaChooseCalendar translation');
});

test('provider: getDefaultCalendar returns null for MD', () => {
  assert.ok(providerSrc.includes("getDefaultCalendar"),
    'provider must reference getDefaultCalendar');
  assert.ok(configSrc.includes("if (countryCode === 'MD') return null;"),
    'getDefaultCalendar must return null for MD');
});

test('no Moldova seed data exists in calendar seed migrations', () => {
  const migrationFiles = readdirSync(join(root, 'supabase', 'migrations'))
    .filter(f => f.includes('seed') && f.includes('calendar'));
  for (const file of migrationFiles) {
    const content = readFileSync(join(root, 'supabase', 'migrations', file), 'utf8');
    assert.ok(!content.includes("'MD'"),
      `migration ${file} must not contain MD calendar seed data`);
  }
});

test('calendar.tsx: normal calendar UI is hidden for MD', () => {
  const unavailableKey = calendarSrc.indexOf("t('calendar.moldovaUnavailable')");
  assert.ok(unavailableKey !== -1, 'MD unavailable state must exist');
  const normalGuard = calendarSrc.indexOf("countryCode !== 'MD'", unavailableKey);
  assert.ok(normalGuard !== -1, 'normal calendar UI must be guarded for non-MD only');
  const monthHeader = calendarSrc.indexOf('styles.monthHeader', normalGuard);
  assert.ok(monthHeader !== -1, 'normal month calendar must exist after the non-MD guard');
  assert.ok(normalGuard < monthHeader, 'non-MD guard must wrap the normal calendar UI');
});
