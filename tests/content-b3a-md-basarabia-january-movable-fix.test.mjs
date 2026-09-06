import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// CONTENT-B3A-JAN-FIX — Structural/factual test: Basarabia January movable observances
// LOCAL files only. No live database connection.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const fixSql = readFileSync(
  join(root, 'supabase/migrations/20260904000400_fix_md_basarabia_january_movable_observances.sql'),
  'utf8',
);

// Split the migration into per-date UPDATE blocks.
const blocks = fixSql
  .split(/UPDATE\s+public\.calendar_days/gi)
  .slice(1);

function blockForDate(dateStr) {
  return blocks.find((b) => b.includes(`'${dateStr}'`));
}

function titleOf(block) {
  const m = block.match(/title\s*=\s*'((?:[^']|'')*)'/);
  return m ? m[1] : '';
}

function fastingNoteOf(block) {
  const m = block.match(/fasting_note\s*=\s*(NULL|'((?:[^']|'')*)')/);
  return m ? m[0].replace(/^fasting_note\s*=\s*/, '') : undefined;
}

function datesInBlock(block) {
  const dates = [];
  for (const m of block.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)) {
    dates.push(m[1]);
  }
  return dates;
}

// ── 1. Wrong Sunday labels removed ──────────────────────────────────────────

test('1. No "Duminica" text remains on Jan 2, 9, 17, 24, 31', () => {
  for (const d of [2, 9, 17, 24, 31]) {
    const block = blockForDate(`2026-01-${String(d).padStart(2, '0')}`);
    assert.ok(block, `must update 2026-01-${d}`);
    assert.ok(!titleOf(block).includes('Duminica'), `Jan ${d} must not contain a Sunday label`);
  }
});

// ── 2. Correct Sunday labels added on the true Sundays ──────────────────────

test('2. Correct Sunday labels exist on Jan 4, 11, 18, 25', () => {
  const expected = {
    '2026-01-04': 'Duminica dinaintea Naşterii Domnului',
    '2026-01-11': 'Duminica după Nașterea Domnului',
    '2026-01-18': 'Duminica dinaintea Botezului Domnului',
    '2026-01-25': 'Duminica după Botezul Domnului',
  };
  for (const [date, label] of Object.entries(expected)) {
    const block = blockForDate(date);
    assert.ok(block, `must update ${date}`);
    assert.ok(titleOf(block).includes('Duminica'), `${date} must carry a Sunday label`);
    assert.ok(titleOf(block).includes(label), `${date} must contain "${label}"`);
  }
});

// ── 3. False "Dezlegare la peşte" removed from Jan 1 ────────────────────────

test('3. Jan 1 no longer contains "Dezlegare la peşte"', () => {
  const block = blockForDate('2026-01-01');
  assert.ok(block, 'must update 2026-01-01');
  assert.ok(!titleOf(block).includes('Dezlegare la peşte'), 'Jan 1 must not claim fish allowance');
});

// ── 4. Target scope: MD / ro / md-basarabia, January 2026 only ─────────────

test('4. Every UPDATE targets MD / ro / md-basarabia', () => {
  assert.ok(blocks.length > 0, 'must contain UPDATE statements');
  for (const block of blocks) {
    assert.ok(block.includes("country_code = 'MD'"), 'must filter country_code = MD');
    assert.ok(block.includes("language_code = 'ro'"), 'must filter language_code = ro');
    assert.ok(block.includes("calendar_code = 'md-basarabia'"), 'must filter calendar_code = md-basarabia');
  }
});

test('5. No February-December dates are modified', () => {
  for (const block of blocks) {
    for (const date of datesInBlock(block)) {
      assert.ok(
        date >= '2026-01-01' && date <= '2026-01-31',
        `found out-of-range target date ${date}`,
      );
    }
  }
});

test('6. md-chisinau is never referenced in any UPDATE', () => {
  for (const block of blocks) {
    assert.ok(!block.includes('md-chisinau'), 'no UPDATE may reference md-chisinau');
  }
});

// ── 5. Jan 7, 14, 19 remain unchanged ───────────────────────────────────────

test('7. Jan 7, 14, 19 are not modified by the fix', () => {
  for (const date of ['2026-01-07', '2026-01-14', '2026-01-19']) {
    assert.ok(!blockForDate(date), `${date} must not appear in the fix migration`);
  }
});

// ── 6. Fasting annotations applied only where requested ─────────────────────

test('8. Fasting notes are set on the requested fast days (Jan 2, 5, 6, 21, 23, 28)', () => {
  for (const d of [2, 5, 6, 21, 23, 28]) {
    const date = `2026-01-${String(d).padStart(2, '0')}`;
    const block = blockForDate(date);
    assert.ok(block, `must update ${date}`);
    assert.equal(fastingNoteOf(block), "'Post'", `${date} must carry fasting note 'Post'`);
  }
});

test('9. Jan 30 is a fast day with the independently-verified fish allowance only', () => {
  const block = blockForDate('2026-01-30');
  assert.ok(block, 'must update 2026-01-30');
  assert.equal(fastingNoteOf(block), "'Dezlegare la pește'", 'Jan 30 fish allowance');
});

test('10. Sunday rank convention applied consistently', () => {
  for (const d of [4, 11, 18, 25]) {
    const date = `2026-01-${String(d).padStart(2, '0')}`;
    const block = blockForDate(date);
    assert.ok(block.includes("feast_rank = 'cruce roșie'"), `${date} must be 'cruce roșie'`);
  }
  for (const d of [2, 9, 17, 24, 31]) {
    const date = `2026-01-${String(d).padStart(2, '0')}`;
    const block = blockForDate(date);
    assert.ok(block.includes("feast_rank = 'cruce neagră'"), `${date} rank must be the neutral safe rank`);
  }
});