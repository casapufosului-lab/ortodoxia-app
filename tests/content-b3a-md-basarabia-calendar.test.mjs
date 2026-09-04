import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// CONTENT-B3A — Structural test: Moldova Basarabia 2026 calendar seed
// LOCAL files only. No live database connection.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

// Extract dates only from INSERT VALUES rows (lines containing the RO country code).
// This excludes date literals from UPDATE … WHERE clauses.
function extractDates(sql) {
  const insertLines = sql.split('\n').filter((l) => l.includes("'RO'"));
  const dates = [];
  for (const line of insertLines) {
    const m = line.match(/'(\d{4}-\d{2}-\d{2})'/);
    if (m) dates.push(m[1]);
  }
  return dates;
}

function expectedDates2026() {
  const dates = [];
  for (let m = 1; m <= 12; m++) {
    const daysInMonth = new Date(2026, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(`2026-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }
  return dates;
}

const roMainSql = read('supabase/migrations/20260831000700_seed_ro_calendar_2026.sql');
const roAugSql = read('supabase/migrations/20260831000600_seed_ro_calendar_august_2026.sql');
const mdMigrationSql = read('supabase/migrations/20260904000200_seed_md_basarabia_calendar_2026.sql');
const calendarTsx = read('src/app/(tabs)/calendar.tsx');

const roDatesRaw = [...extractDates(roMainSql), ...extractDates(roAugSql)];
const roDates = [...new Set(roDatesRaw)].sort();
const expectedDates = expectedDates2026();

// ── RO-BOR 2026 source validation ───────────────────────────────────────────

test('1. RO-BOR 2026 resolves to exactly 365 unique dates', () => {
  assert.equal(roDates.length, 365,
    `expected 365 unique dates, got ${roDates.length}`);
});

test('2. RO-BOR 2026 first date is 2026-01-01', () => {
  assert.equal(roDates[0], '2026-01-01');
});

test('3. RO-BOR 2026 last date is 2026-12-31', () => {
  assert.equal(roDates[roDates.length - 1], '2026-12-31');
});

test('4. RO-BOR 2026 has zero missing dates', () => {
  const roSet = new Set(roDates);
  const missing = expectedDates.filter((d) => !roSet.has(d));
  assert.equal(missing.length, 0, `missing dates: ${missing.join(', ')}`);
});

test('5. RO-BOR 2026 has zero duplicate dates', () => {
  assert.equal(roDatesRaw.length, 365,
    `expected 365 total date occurrences, got ${roDatesRaw.length}`);
});

// ── migration target identification ──────────────────────────────────────────

test('6. New migration targets country_code MD', () => {
  assert.ok(mdMigrationSql.includes("'MD'"), 'must contain MD');
});

test('7. New migration targets language_code ro', () => {
  assert.ok(mdMigrationSql.includes("'ro'"), 'must contain ro');
});

test('8. New migration targets calendar_code md-basarabia', () => {
  assert.ok(mdMigrationSql.includes("'md-basarabia'"), 'must contain md-basarabia');
});

// ── migration source restriction ─────────────────────────────────────────────

test('9. New migration sources ONLY from RO / ro / ro-bor', () => {
  assert.ok(mdMigrationSql.includes("country_code = 'RO'"), 'source must filter RO');
  assert.ok(mdMigrationSql.includes("language_code = 'ro'"), 'source must filter ro');
  assert.ok(mdMigrationSql.includes("calendar_code = 'ro-bor'"), 'source must filter ro-bor');
  const fromMatch = mdMigrationSql.match(/FROM\s+public\.calendar_days/i);
  assert.ok(fromMatch, 'FROM public.calendar_days must exist');
});

test('10. New migration limits source calendar_date to 2026', () => {
  assert.ok(mdMigrationSql.includes(">= '2026-01-01'"), 'must filter >= 2026-01-01');
  assert.ok(mdMigrationSql.includes("<= '2026-12-31'"), 'must filter <= 2026-12-31');
});

// ── field structure ──────────────────────────────────────────────────────────

test('11. Same calendar_days field structure is preserved', () => {
  const fields = [
    'country_code', 'language_code', 'calendar_code', 'calendar_date',
    'feast_rank', 'saints', 'title', 'details', 'fasting_note',
    'editorial_source', 'is_published',
  ];
  for (const f of fields) {
    assert.ok(mdMigrationSql.includes(f), `must include field: ${f}`);
  }
  assert.ok(
    mdMigrationSql.includes("'Compilație proprie Ortodoxia, 2026 · Mitropolia Basarabiei / BOR'"),
    'editorial_source must be overridden with correct literal',
  );
});

// ── editorial_source ─────────────────────────────────────────────────────────

test('12. editorial_source contains "Compilație proprie Ortodoxia, 2026"', () => {
  assert.ok(
    mdMigrationSql.includes('Compilație proprie Ortodoxia, 2026'),
    'must contain required provenance string',
  );
});

// ── exclusions ───────────────────────────────────────────────────────────────

test('13. Migration does NOT contain md-chisinau', () => {
  assert.ok(!mdMigrationSql.includes('md-chisinau'), 'must not reference md-chisinau');
});

test('14. Migration does NOT update or delete RO rows', () => {
  const upper = mdMigrationSql.toUpperCase();
  assert.ok(!upper.includes('DELETE FROM'), 'must not contain DELETE');
  if (mdMigrationSql.includes('ON CONFLICT')) {
    assert.ok(mdMigrationSql.includes('DO UPDATE SET'), 'ON CONFLICT must use DO UPDATE SET');
  }
});

// ── UI guard ─────────────────────────────────────────────────────────────────

test('15. Existing Moldova unavailable UI guard remains present', () => {
  assert.ok(calendarTsx.includes("countryCode === 'MD'"), 'MD guard must exist');
  assert.ok(calendarTsx.includes("calendar.moldovaUnavailable"), 'unavailable key must exist');
});

// ── external prose ───────────────────────────────────────────────────────────

test('16. No Moldova Basarabia external prose is introduced', () => {
  const markers = ['Sinaxar', 'sinaxar', 'Biografie', 'biografie',
    'Viețile Sfinților', 'viețile sfinților'];
  for (const m of markers) {
    assert.ok(!mdMigrationSql.includes(m), `must not contain prose: "${m}"`);
  }
});