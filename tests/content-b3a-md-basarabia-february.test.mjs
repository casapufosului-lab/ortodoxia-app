import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// CONTENT-B3A-FEB — Structural/factual test: Basarabia February 2026 calendar.
// LOCAL files only. No live database connection.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const migrationSql = readFileSync(
  join(root, 'supabase/migrations/20260904000600_correct_md_basarabia_february_2026.sql'),
  'utf8',
);

const EXPECTED_PROVENANCE = 'Compilație proprie Ortodoxia, 2026 · calendar iulian verificat factual din surse publice';
const FORBIDDEN_PROVENANCE = 'Compilație proprie Ortodoxia, 2026 · Mitropolia Basarabiei / BOR';

function weekdayOf(dateStr) {
  // 0 = Sunday .. 6 = Saturday
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// Parse each INSERT row of the migration.
const rowRe =
  /^\s*\('MD', 'ro', 'md-basarabia', '(\d{4}-\d{2}-\d{2})',\s*'([^']*)',\s*array\[\]::text\[\],\s*'([^']*)',\s*NULL,\s*(NULL|'[^']*'),\s*'([^']*)',\s*true\)/gm;

function parseRows(sql) {
  const rows = [];
  let m;
  while ((m = rowRe.exec(sql)) !== null) {
    rows.push({
      date: m[1],
      rank: m[2],
      title: m[3],
      fastingNote: m[4] === 'NULL' ? null : m[4].replace(/^'|'$/g, ''),
      source: m[5],
    });
  }
  return rows;
}

const rows = parseRows(migrationSql);
const byDate = new Map(rows.map((r) => [r.date, r]));

// ── 1. Coverage: exactly 28 unique February target dates ────────────────────

test('1. Migration contains exactly 28 INSERT rows', () => {
  assert.equal(rows.length, 28, 'must insert exactly 28 rows');
});

test('2. All 28 dates from 2026-02-01 through 2026-02-28 are present', () => {
  const present = new Set(rows.map((r) => r.date));
  assert.equal(present.size, 28, 'dates must be unique');
  const expected = [];
  for (let day = 1; day <= 28; day += 1) {
    expected.push(`2026-02-${String(day).padStart(2, '0')}`);
  }
  for (const date of expected) {
    assert.ok(present.has(date), `missing target date ${date}`);
  }
});

test('3. No date literals outside 2026-02-01 .. 2026-02-28 are referenced', () => {
  const literals = [];
  for (const m of migrationSql.matchAll(/'(\d{4}-\d{2}-\d{2})'/g)) {
    literals.push(m[1]);
  }
  assert.ok(literals.length > 0, 'migration must reference date literals');
  for (const date of literals) {
    assert.ok(
      date >= '2026-02-01' && date <= '2026-02-28',
      `found out-of-range date literal ${date}`,
    );
  }
});

test('4. DELETE statement scopes its deletion to February 2026 only', () => {
  assert.ok(migrationSql.includes("DELETE FROM public.calendar_days"), 'must DELETE from calendar_days');
  assert.ok(migrationSql.includes("calendar_date >= '2026-02-01'"), 'delete lower bound must be 2026-02-01');
  assert.ok(migrationSql.includes("calendar_date <= '2026-02-28'"), 'delete upper bound must be 2026-02-28');
});

// ── 2. Target scope: MD / ro / md-basarabia only ────────────────────────────

test('5. Every INSERT row targets MD / ro / md-basarabia', () => {
  assert.ok(rows.length > 0, 'must contain INSERT rows');
  const mdRows = (migrationSql.match(/\('MD', 'ro', 'md-basarabia',/g) ?? []).length;
  assert.equal(mdRows, 28, 'exactly 28 MD/ro/md-basarabia row literals');
});

test('6. md-chisinau is never referenced', () => {
  assert.ok(!migrationSql.includes('md-chisinau'), 'must not reference md-chisinau');
});

// ── 3. Sunday labels only on real Sundays ───────────────────────────────────

const REAL_SUNDAYS = ['2026-02-01', '2026-02-08', '2026-02-15', '2026-02-22'];

test('7. "Duminica" appears only on real Sundays (Feb 1, 8, 15, 22)', () => {
  for (const r of rows) {
    const isSunday = weekdayOf(r.date) === 0;
    if (r.title.includes('Duminica')) {
      assert.ok(isSunday, `${r.date} has a Sunday label but is not a Sunday`);
    }
  }
});

test('8. Every real Sunday carries a Sunday label and cruce roșie', () => {
  for (const date of REAL_SUNDAYS) {
    const r = byDate.get(date);
    assert.ok(r, `missing row for ${date}`);
    assert.ok(r.title.includes('Duminica'), `${date} must have a Sunday label`);
    assert.equal(r.rank, 'cruce roșie', `${date} must be cruce roșie`);
  }
});

test('9. Correct Triodion Sunday titles are placed on the correct dates', () => {
  const expectedTitles = {
    '2026-02-01': 'Duminica Vameșului și a Fariseului',
    '2026-02-08': 'Duminica Întoarcerii Fiului risipitor',
    '2026-02-15': 'Duminica Înfricoșătoarei Judecăți (a Lăsatului sec de carne)',
    '2026-02-22': 'Duminica Izgonirii lui Adam din Rai (a Lăsatului sec de brânză)',
  };
  for (const [date, label] of Object.entries(expectedTitles)) {
    const r = byDate.get(date);
    assert.ok(r, `missing row for ${date}`);
    assert.ok(r.title.includes(label), `${date} must contain "${label}"`);
  }
});

test('10. No "N-a după Rusalii" numbered Sunday labels are copied', () => {
  for (const r of rows) {
    assert.ok(!/după Rusalii/.test(r.title), `${r.date} must not carry the numbered Rusalii form`);
  }
});
// ── 4. Fixed feasts verify the old-style (Julian) mapping ───────────────────

test('11. Key fixed feasts are placed on the verified Julian equivalents', () => {
  const checks = {
    '2026-02-01': ['Sf. Cuv. Macarie cel Mare'], // Julian Jan 19
    '2026-02-12': ['Sfinții Trei Ierarhi'], // Julian Jan 30
    '2026-02-14': ['Sf. Mc. Trifon'], // Julian Feb 1
    '2026-02-15': ['Întâmpinarea Domnului'], // Julian Feb 2 (Presentation)
    '2026-02-22': ['Odovania praznicului Întâmpinării Domnului'], // Julian Feb 9
    '2026-02-23': ['Sf. Sfințit Mc. Haralambie'], // Julian Feb 10 (Clean Monday)
  };
  for (const [date, needles] of Object.entries(checks)) {
    const r = byDate.get(date);
    assert.ok(r, `missing row for ${date}`);
    for (const needle of needles) {
      assert.ok(r.title.includes(needle), `${date} must contain "${needle}"`);
    }
  }
});

test('12. Întâmpinarea Domnului and Meatfare Sunday are combined on Feb 15', () => {
  const r = byDate.get('2026-02-15');
  assert.ok(r, 'missing row for 2026-02-15');
  assert.ok(r.title.includes('Întâmpinarea Domnului'), 'Feb 15 is the Presentation of the Lord');
  assert.ok(r.title.includes('Duminica Înfricoșătoarei Judecăți'), 'Feb 15 is also Meatfare Sunday');
  assert.equal(r.rank, 'cruce roșie');
});

// ── 5. Weekday-dependent Saturday memorials re-derived ──────────────────────

test('13. Memorial Saturdays are placed on the correct target Saturdays', () => {
  const r14 = byDate.get('2026-02-14');
  assert.ok(r14, 'missing row for 2026-02-14');
  assert.ok(r14.title.includes('Sâmbăta celor adormiți - Moșii de iarnă'), 'Feb 14 must be the winter memorial Saturday');

  const r21 = byDate.get('2026-02-21');
  assert.ok(r21, 'missing row for 2026-02-21');
  assert.ok(r21.title.includes('Sâmbăta Sfinților Cuvioși'), 'Feb 21 must be the Saturday of the Holy Monastics');
});

test('14. Non-Saturday days do not carry Saturday memorial annotations', () => {
  const memoRe = /Sâmbăta (celor adormiți|Sfinților Cuvioși)/;
  for (const r of rows) {
    if (memoRe.test(r.title)) {
      assert.ok(
        weekdayOf(r.date) === 6,
        `${r.date} carries a Saturday annotation but is not a Saturday`,
      );
    }
  }
});

// ── 6. Feast ranks re-derived for target dates ──────────────────────────────

test('15. Feast ranks are cruce roșie only for Sundays, Întâmpinarea and Trei Ierarhi', () => {
  const redDays = new Set(['2026-02-01', '2026-02-08', '2026-02-12', '2026-02-15', '2026-02-22']);
  for (const r of rows) {
    if (redDays.has(r.date)) {
      assert.equal(r.rank, 'cruce roșie', `${r.date} rank`);
    } else {
      assert.equal(r.rank, 'cruce neagră', `${r.date} rank`);
    }
  }
});
// ── 7. Fasting re-derived for the target civil weekdays ─────────────────────

const EXPECTED_FASTING = {
  '2026-02-01': null, '2026-02-02': null, '2026-02-03': null, '2026-02-04': null,
  '2026-02-05': null, '2026-02-06': null, '2026-02-07': null, '2026-02-08': null,
  '2026-02-09': null, '2026-02-10': null, '2026-02-11': 'Post', '2026-02-12': null,
  '2026-02-13': 'Post', '2026-02-14': null, '2026-02-15': null, '2026-02-16': null,
  '2026-02-17': null, '2026-02-18': null, '2026-02-19': null, '2026-02-20': null,
  '2026-02-21': null, '2026-02-22': null, '2026-02-23': 'Post', '2026-02-24': 'Post',
  '2026-02-25': 'Post', '2026-02-26': 'Post', '2026-02-27': 'Post', '2026-02-28': 'Post',
};

test('16. Fasting notes match the re-derived target-weekday rules', () => {
  for (const [date, expected] of Object.entries(EXPECTED_FASTING)) {
    const r = byDate.get(date);
    assert.ok(r, `missing row for ${date}`);
    assert.equal(r.fastingNote, expected, `${date} fasting_note`);
  }
});

test('17. Fast-free week (Publican & Pharisee) has no fasting note even on Wed/Fri', () => {
  for (const date of ['2026-02-04', '2026-02-06']) {
    const r = byDate.get(date);
    assert.equal(r.fastingNote, null, `${date} must have no fasting note in the fast-free week`);
  }
});

test('18. Meatfare-week Wed/Fri are not marked as strict Post days', () => {
  for (const date of ['2026-02-18', '2026-02-20']) {
    const r = byDate.get(date);
    assert.equal(r.fastingNote, null, `${date} must not carry strict Post note (dairy allowed in Meatfare week)`);
    assert.ok(!r.title.includes('Post'), `${date} title must not claim strict Post`);
  }
});

test('19. Great-Lent week (Feb 23-28) is marked Post on every day', () => {
  for (let day = 23; day <= 28; day += 1) {
    const date = `2026-02-${day}`;
    const r = byDate.get(date);
    assert.equal(r.fastingNote, 'Post', `${date} fasting_note`);
  }
});

test('20. Clean Monday begins Lent with the aliturgical annotation', () => {
  const r = byDate.get('2026-02-23');
  assert.ok(r.title.includes('Începutul Postului Sfintelor Paști'), 'Feb 23 marks the start of Great Lent');
  assert.ok(r.title.includes('Zi aliturgică'), 'Feb 23 marks an aliturgical day');
});

// ── 8. Provenance does not imply official verification ──────────────────────

test('21. Every row uses the factual compiled provenance', () => {
  for (const r of rows) {
    assert.equal(r.source, EXPECTED_PROVENANCE, `${r.date} editorial_source`);
  }
});

test('22. No official Mitropolia Basarabiei / BOR verification is claimed', () => {
  assert.ok(!migrationSql.includes(FORBIDDEN_PROVENANCE), 'forbidden provenance literal must be absent');
  assert.ok(!/Mitropolia Basarabiei\s*\/\s*BOR/.test(migrationSql), 'must not imply official Diocese/BOR verification');
  assert.ok(!/verificat de Mitropolia/.test(migrationSql), 'must not claim Diocese verification');
});

// ── 9. No RO weekday-dependent content copied blindly ───────────────────────

test('23. No Sunday labels copied from RO civil dates land on MD weekdays', () => {
  // RO Jan 25 (Sun), Feb 1 (Sun), Feb 8 (Sun), Feb 15 (Sun) carry Sunday labels
  // in the new-style source. Their +13 MD targets are Feb 7, 14, 21, 28 —
  // all Saturdays, which must NOT carry those Sunday labels.
  for (const date of ['2026-02-07', '2026-02-14', '2026-02-21', '2026-02-28']) {
    const r = byDate.get(date);
    assert.ok(r, `missing row for ${date}`);
    assert.ok(!r.title.includes('Duminica'), `${date} must have no copied Sunday label`);
    assert.ok(!/după Rusalii/.test(r.title), `${date} must not carry the numbered Rusalii form`);
    assert.equal(r.rank, 'cruce neagră', `${date} must be cruce neagră`);
  }
});

test('24. No RO Meatfare-week/other-weekday fasting notes are copied', () => {
  // RO Feb 18 / Feb 20 carry "Dezlegare la brânză, lapte, ouă şi peşte" notes
  // for the new-style Meatfare week; their +13 MD targets fall outside February
  // and none of the MD February rows may carry those RO date annotations.
  assert.ok(!migrationSql.includes('Dezlegare la brânză'), 'no copied RO cheese-week note');
  assert.ok(!migrationSql.includes('Dezlegare la ouă'), 'no copied RO egg relaxation note');
});