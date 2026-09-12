import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const configSrc = readFileSync('src/i18n/config.ts', 'utf8');
const calendarSrc = readFileSync('src/app/(tabs)/calendar.tsx', 'utf8');
const indexSrc = readFileSync('src/app/(tabs)/index.tsx', 'utf8');
const fallbackSrc = readFileSync('src/lib/moldova-calendar-fallback.ts', 'utf8');
const basarabiaFallback = JSON.parse(readFileSync('src/data/md-calendar-2026.json', 'utf8'));
const chisinauFallback = JSON.parse(readFileSync('src/data/md-chisinau-calendar-2026.json', 'utf8'));
const seedSql = readFileSync('supabase/migrations/20260912030100_seed_md_orthodox_calendars_2026.sql', 'utf8');

test('Moldova keeps both jurisdiction calendar options', () => {
  assert.ok(configSrc.includes("'md-basarabia'"));
  assert.ok(configSrc.includes("'md-chisinau'"));
});

test('Moldova no longer short-circuits calendar loading as unavailable', () => {
  const loadStart = calendarSrc.indexOf('const loadCalendar');
  const loadEnd = calendarSrc.indexOf('useEffect(() => {', loadStart);
  const loadCalendarSrc = calendarSrc.slice(loadStart, loadEnd);
  const rpcStart = calendarSrc.indexOf("supabase.rpc('get_calendar_days_localized'", loadStart);
  const mdReturn = loadCalendarSrc.indexOf("countryCode === 'MD'");
  assert.ok(rpcStart !== -1, 'localized calendar RPC must still be used');
  assert.equal(mdReturn, -1, 'calendar loading must not return early for MD');
});

test('Home calendar section is not hidden for Moldova', () => {
  assert.ok(!indexSrc.includes("countryCode !== 'MD' ? ("));
  assert.ok(indexSrc.includes("t('home.calendarSectionTitle')"));
});

test('Moldova calendar screens use the bundled 2026 fallback while remote seed is pending', () => {
  assert.ok(calendarSrc.includes('getMoldovaCalendarFallbackRange'));
  assert.ok(indexSrc.includes('getMoldovaCalendarFallbackDay'));
  assert.ok(fallbackSrc.includes("'md-basarabia'"));
  assert.ok(fallbackSrc.includes("'md-chisinau'"));
  assert.ok(fallbackSrc.includes('mdChisinauCalendar2026'));
});

test('Moldova bundled fallback calendars are separate datasets', () => {
  assert.equal(basarabiaFallback.length, 365);
  assert.equal(chisinauFallback.length, 365);
  assert.equal(new Set(basarabiaFallback.map((entry) => entry.calendar_date)).size, 365);
  assert.equal(new Set(chisinauFallback.map((entry) => entry.calendar_date)).size, 365);
  assert.notEqual(
    basarabiaFallback.find((entry) => entry.calendar_date === '2026-09-12')?.title,
    chisinauFallback.find((entry) => entry.calendar_date === '2026-09-12')?.title,
  );
});

test('Moldova seed has independent Basarabia and Chisinau rows', () => {
  const basarabiaRows = (seedSql.match(/\('MD','ro','md-basarabia'/g) ?? []).length;
  const chisinauRows = (seedSql.match(/\('MD','ro','md-chisinau'/g) ?? []).length;
  assert.equal(basarabiaRows, 365);
  assert.equal(chisinauRows, 365);
});

test('Moldova seed validates full civil year boundaries', () => {
  assert.ok(seedSql.includes("v_count <> 365"));
  assert.ok(seedSql.includes("v_unique <> 365"));
  assert.ok(seedSql.includes("v_min <> '2026-01-01'"));
  assert.ok(seedSql.includes("v_max <> '2026-12-31'"));
});
