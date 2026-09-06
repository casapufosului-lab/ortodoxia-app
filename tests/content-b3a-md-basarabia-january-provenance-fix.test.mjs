import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// CONTENT-B3A-JAN-PROVENANCE-FIX — Structural/factual test: Basarabia January provenance
// LOCAL files only. No live database connection.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const fixSql = readFileSync(
  join(root, 'supabase/migrations/20260904000500_fix_md_basarabia_january_provenance.sql'),
  'utf8',
);

const NEW_PROVENANCE = 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice';
const OLD_PROVENANCE = 'Compilație proprie Ortodoxia, 2026 · Mitropolia Basarabiei / BOR';

function setClause() {
  const m = fixSql.match(/set\s+([\s\S]*?)\s+where\s+/i);
  return m ? m[1] : '';
}

// ── 1. Corrected provenance assigned to all 31 January rows ────────────────

test('1. Migration assigns the corrected factual provenance', () => {
  assert.ok(
    fixSql.includes(`editorial_source = '${NEW_PROVENANCE}'`),
    'must set editorial_source to corrected provenance',
  );
});

test('2. Coverage bound reaches every January day (Jan 1 .. Jan 31)', () => {
  assert.ok(fixSql.includes("calendar_date >= '2026-01-01'"), 'lower bound must be 2026-01-01');
  assert.ok(fixSql.includes("calendar_date <= '2026-01-31'"), 'upper bound must be 2026-01-31');
});

// ── 2. Old misleading provenance is not assigned ────────────────────────────

test('3. Old misleading provenance literal is absent', () => {
  assert.ok(!fixSql.includes(OLD_PROVENANCE), `must not contain old provenance literal`);
});

test('4. No Diocese/BOR attribution is referenced anywhere', () => {
  assert.ok(!fixSql.includes('Mitropolia'), 'must not reference "Mitropolia"');
  assert.ok(!fixSql.includes('BOR'), 'must not reference "BOR"');
  assert.ok(!fixSql.includes('Mitropolia Basarabiei'), 'must not reference the Diocese name');
});

// ── 3. Only MD / ro / md-basarabia January 2026 is targeted ────────────────

test('5. UPDATE targets MD / ro / md-basarabia only', () => {
  assert.ok(fixSql.includes("UPDATE public.calendar_days"), 'must update calendar_days');
  assert.ok(fixSql.includes("country_code = 'MD'"), 'must filter country_code = MD');
  assert.ok(fixSql.includes("language_code = 'ro'"), 'must filter language_code = ro');
  assert.ok(fixSql.includes("calendar_code = 'md-basarabia'"), 'must filter calendar_code = md-basarabia');
});

test('6. No February-December (or any other year) date is referenced', () => {
  const dateLiterals = [];
  for (const m of fixSql.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)) {
    dateLiterals.push(m[1]);
  }
  for (const date of dateLiterals) {
    assert.ok(
      date >= '2026-01-01' && date <= '2026-01-31',
      `found out-of-range date literal ${date}`,
    );
  }
});

test('7. md-chisinau is never referenced', () => {
  assert.ok(!fixSql.includes('md-chisinau'), 'must not reference md-chisinau');
});

// ── 4. Only editorial_source is changed ────────────────────────────────────

test('8. Only editorial_source is modified (no content/rank/fasting fields)', () => {
  const set = setClause();
  assert.ok(set.length > 0, 'must contain a SET clause');
  assert.ok(/^\s*editorial_source\s*=\s*'[^']*'\s*$/.test(set), `SET must touch editorial_source only, got: ${set}`);
  assert.ok(!/title\s*=/.test(set), 'SET must not touch title');
  assert.ok(!/feast_rank\s*=/.test(set), 'SET must not touch feast_rank');
  assert.ok(!/fasting_note\s*=/.test(set), 'SET must not touch fasting_note');
  assert.ok(!/saints\s*=/.test(set), 'SET must not touch saints');
  assert.ok(!/details\s*=/.test(set), 'SET must not touch details');
});

test('9. Only a single UPDATE statement exists', () => {
  const count = (fixSql.match(/UPDATE\s+public\.calendar_days/gi) || []).length;
  assert.equal(count, 1, 'exactly one UPDATE statement expected');
});