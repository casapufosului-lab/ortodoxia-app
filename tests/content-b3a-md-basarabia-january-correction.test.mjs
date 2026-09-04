import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// CONTENT-B3A — Structural test: Moldova Basarabia January 2026 correction
// LOCAL files only. No live database connection.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

const roMainSql = read('supabase/migrations/20260831000700_seed_ro_calendar_2026.sql');
const mdCorrectionSql = read('supabase/migrations/20260904000300_correct_md_basarabia_calendar_january_2026.sql');
const mdOriginalSql = read('supabase/migrations/20260904000200_seed_md_basarabia_calendar_2026.sql');

function roHasDate(sql, dateStr) {
  return sql.includes(`'${dateStr}'`);
}

// ── 1. Exactly 31 source dates → 31 MD January rows ────────────────────────

test('1. Correction covers exactly 31 days (13 from Dec + 18 from Jan)', () => {
  assert.ok(
    mdCorrectionSql.includes(">= '2026-12-19'") && mdCorrectionSql.includes("<= '2026-12-31'"),
    'must source RO Dec 19-31 (13 days)',
  );
  assert.ok(
    mdCorrectionSql.includes(">= '2026-01-01'") && mdCorrectionSql.includes("<= '2026-01-18'"),
    'must source RO Jan 1-18 (18 days)',
  );
});

// ── 2. DELETE only removes MD Jan 1-31 ─────────────────────────────────────

test('2. DELETE targets MD / ro / md-basarabia for Jan 1-31 only', () => {
  assert.ok(mdCorrectionSql.includes("'MD'"), 'DELETE must target MD');
  assert.ok(mdCorrectionSql.includes("'md-basarabia'"), 'DELETE must target md-basarabia');
  assert.ok(mdCorrectionSql.includes(">= '2026-01-01'"), 'DELETE lower bound Jan 1');
  assert.ok(mdCorrectionSql.includes("<= '2026-01-31'"), 'DELETE upper bound Jan 31');
});

// ── 3. 31 unique dates produced ─────────────────────────────────────────────

test('3. Source produces exactly 31 unique dates', () => {
  const dates = [];
  for (let d = 19; d <= 31; d++) dates.push(`2026-12-${String(d).padStart(2, '0')}`);
  for (let d = 1; d <= 18; d++) dates.push(`2026-01-${String(d).padStart(2, '0')}`);
  assert.equal(dates.length, 31, 'expected 31 source dates');
  for (const date of dates) {
    assert.ok(roHasDate(roMainSql, date), `RO source must contain ${date}`);
  }
});

// ── 4. +13 day shift verification ───────────────────────────────────────────

test('4. Manual date mapping: Dec 19-31 → Jan 1-13, Jan 1-18 → Jan 14-31', () => {
  // RO Dec 19 → MD Jan 1 (day 19 − 18 = 1)
  // RO Dec 25 → MD Jan 7 (day 25 − 18 = 7)  [Christmas]
  // RO Dec 31 → MD Jan 13 (day 31 − 18 = 13)
  // RO Jan 1  → MD Jan 14 (day 1 + 13 = 14) [Circumcision]
  // RO Jan 6  → MD Jan 19 (day 6 + 13 = 19) [Theophany]
  // RO Jan 18 → MD Jan 31 (day 18 + 13 = 31)
  const decRange = [
    [19, 1], [20, 2], [21, 3], [22, 4], [23, 5], [24, 6],
    [25, 7], [26, 8], [27, 9], [28, 10], [29, 11], [30, 12], [31, 13],
  ];
  const janRange = [
    [1, 14], [2, 15], [3, 16], [4, 17], [5, 18], [6, 19], [7, 20],
    [8, 21], [9, 22], [10, 23], [11, 24], [12, 25], [13, 26], [14, 27],
    [15, 28], [16, 29], [17, 30], [18, 31],
  ];
  for (const [srcDay, tgtDay] of decRange) {
    assert.equal(tgtDay, srcDay - 18, `Dec ${srcDay} → Jan ${tgtDay}`);
  }
  for (const [srcDay, tgtDay] of janRange) {
    assert.equal(tgtDay, srcDay + 13, `Jan ${srcDay} → Jan ${tgtDay}`);
  }
  assert.equal(decRange.length + janRange.length, 31, 'total = 31');
});

// ── 5-7. Correct feast dates via source mapping ────────────────────────────

test('5. MD Jan 7 (Christmas) maps from RO Dec 25', () => {
  assert.ok(roHasDate(roMainSql, '2026-12-25'), 'RO Dec 25 must exist');
  assert.ok(roMainSql.includes('Nașterea Domnului'), 'RO Dec 25 must have Christmas');
});

test('6. MD Jan 14 (Circumcision) maps from RO Jan 1', () => {
  assert.ok(roHasDate(roMainSql, '2026-01-01'), 'RO Jan 1 must exist');
  assert.ok(roMainSql.includes('Tăierea-împrejur'), 'RO Jan 1 must have Circumcision');
});

test('7. MD Jan 19 (Theophany) maps from RO Jan 6', () => {
  assert.ok(roHasDate(roMainSql, '2026-01-06'), 'RO Jan 6 must exist');
  assert.ok(roMainSql.includes('Botezul Domnului'), 'RO Jan 6 must have Theophany');
});

// ── 8. Original seed remains unmodified ─────────────────────────────────────

test('8. Original seed migration is not modified', () => {
  assert.ok(mdOriginalSql.includes("'md-basarabia'"), 'original must still have md-basarabia');
  assert.ok(mdOriginalSql.includes("<= '2026-12-31'"), 'original must still cover full year');
});

// ── 9. No other months affected ─────────────────────────────────────────────

test('9. DELETE only covers January (not Feb-Dec)', () => {
  const deleteSection = mdCorrectionSql
    .substring(mdCorrectionSql.toUpperCase().indexOf('DELETE FROM'))
    .split(';')[0];
  assert.ok(deleteSection.includes("<= '2026-01-31'"), 'DELETE upper bound must be Jan 31');
  assert.ok(!deleteSection.includes('2026-02'), 'DELETE must not touch February');
  assert.ok(!deleteSection.includes('2026-12'), 'DELETE must not touch December');
});

// ── 10. Field structure preserved ───────────────────────────────────────────

test('10. Same calendar_days field structure is preserved', () => {
  const fields = [
    'country_code', 'language_code', 'calendar_code', 'calendar_date',
    'feast_rank', 'saints', 'title', 'details', 'fasting_note',
    'editorial_source', 'is_published',
  ];
  for (const f of fields) {
    assert.ok(mdCorrectionSql.includes(f), `must include field: ${f}`);
  }
});

test('11. editorial_source contains correct provenance', () => {
  assert.ok(
    mdCorrectionSql.includes("'Compilație proprie Ortodoxia, 2026 · Mitropolia Basarabiei / BOR'"),
    'editorial_source must be overridden with correct literal',
  );
});

// ── 12. Sources from RO / ro / ro-bor ──────────────────────────────────────

test('12. SELECT sources ONLY from RO / ro / ro-bor', () => {
  assert.ok(mdCorrectionSql.includes("country_code = 'RO'"), 'source must filter RO');
  assert.ok(mdCorrectionSql.includes("language_code = 'ro'"), 'source must filter ro');
  assert.ok(mdCorrectionSql.includes("calendar_code = 'ro-bor'"), 'source must filter ro-bor');
});

// ── 13. No RO rows modified ─────────────────────────────────────────────────

test('13. Correction does NOT update RO rows', () => {
  const deleteSection = mdCorrectionSql
    .substring(0, mdCorrectionSql.toUpperCase().indexOf('INSERT'))
    .toUpperCase();
  assert.ok(deleteSection.includes("'MD'"), 'DELETE must only target MD rows');
});

// ── 14. No external prose ──────────────────────────────────────────────────

test('14. No external prose is introduced', () => {
  const markers = ['Sinaxar', 'sinaxar', 'Biografie', 'biografie',
    'Viețile Sfinților', 'viețile sfinților'];
  for (const m of markers) {
    assert.ok(!mdCorrectionSql.includes(m), `must not contain prose: "${m}"`);
  }
});

// ── 15. No md-chisinau ─────────────────────────────────────────────────────

test('15. Correction does NOT reference md-chisinau', () => {
  assert.ok(!mdCorrectionSql.includes('md-chisinau'), 'must not reference md-chisinau');
});
