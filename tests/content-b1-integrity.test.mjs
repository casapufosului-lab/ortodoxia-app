import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const calendarSeedFile = join(
  __dirname, '..', 'supabase', 'migrations',
  '20260831000700_seed_ro_calendar_2026.sql',
);
const calendarSeedContent = readFileSync(calendarSeedFile, 'utf8');

const augustSeedFile = join(
  __dirname, '..', 'supabase', 'migrations',
  '20260831000600_seed_ro_calendar_august_2026.sql',
);
const augustSeedContent = readFileSync(augustSeedFile, 'utf8');

const b1cMigrationFile = join(
  __dirname, '..', 'supabase', 'migrations',
  '20260904000100_fix_daily_content_provenance.sql',
);
const b1cMigrationContent = readFileSync(b1cMigrationFile, 'utf8');

const docFile = join(__dirname, '..', 'docs', 'CONTENT_B1_STATUS.md');
const docContent = readFileSync(docFile, 'utf8');

function extractCalendarDates(sql) {
const re = /\('RO',\s*'ro',\s*'ro-bor',\s*'(\d{4}-\d{2}-\d{2})'/g;
const dates = [];
let m;
while ((m = re.exec(sql)) !== null) dates.push(m[1]);
return dates;
}

const allSeedDates = extractCalendarDates(calendarSeedContent + '\n' + augustSeedContent);
const uniqueSeedDates = [...new Set(allSeedDates)].sort();

test('Romania 2026 seed data resolves to exactly 365 unique dates', () => {
  assert.equal(uniqueSeedDates.length, 365);
});

test('First date is 2026-01-01', () => {
  assert.equal(uniqueSeedDates[0], '2026-01-01');
});

test('Last date is 2026-12-31', () => {
  assert.equal(uniqueSeedDates[uniqueSeedDates.length - 1], '2026-12-31');
});

test('No duplicate Romania 2026 dates', () => {
assert.equal(allSeedDates.length, uniqueSeedDates.length);
});

test('No calendar `details` prose in the 365 seeded records', () => {
  const m = calendarSeedContent.match(/details\s*=\s*'[^']+'/gi) || [];
  assert.equal(m.length, 0, `found ${m.length} non-null details`);
});

test('New migration targets only 2026-08-30 + RO + ro', () => {
  assert.ok(b1cMigrationContent.includes("content_date  = '2026-08-30'"));
  assert.ok(b1cMigrationContent.includes("country_code  = 'RO'"));
  assert.ok(b1cMigrationContent.includes("language_code = 'ro'"));
});

test('New migration does NOT update calendar_days', () => {
  assert.ok(!b1cMigrationContent.includes('calendar_days'));
});

test('New migration changes only allowed daily_content fields', () => {
  // Extract only the SET clause (between SET and WHERE) to avoid matching WHERE conditions
  const setBlockMatch = b1cMigrationContent.match(/SET\s+([\s\S]*?)\s+WHERE/i);
  assert.ok(setBlockMatch, 'migration must have a SET ... WHERE structure');
  const setBlock = setBlockMatch[1];

  const disallowed = ['content_date','parable_title','country_code','language_code','is_published','created_at'];
  for (const f of disallowed) {
    assert.ok(!new RegExp(`\\b${f}\\s*=`, 'i').test(setBlock), `must not SET ${f}`);
  }
  for (const f of ['verse_text','verse_source','parable_text','editorial_source']) {
    assert.ok(setBlock.includes(f), `must SET ${f}`);
  }
});

test('New migration contains ronbl', () => {
  assert.ok(b1cMigrationContent.includes('ronbl'));
});

test('New migration contains Public Domain', () => {
  assert.ok(b1cMigrationContent.includes('Public Domain'));
});

test('New migration removes old Patriarchia/Basilica attribution', () => {
  assert.ok(!b1cMigrationContent.includes('Patriarhiei RomÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ne'));
  assert.ok(!b1cMigrationContent.includes('Basilica.ro'));
});

test('Documentation contains the 365-day audit facts', () => {
  assert.ok(docContent.includes('365'));
  assert.ok(docContent.includes('2026-01-01'));
  assert.ok(docContent.includes('2026-12-31'));
  assert.ok(docContent.includes('NULL'));
  assert.match(docContent, /Compila.*proprie Ortodoxia, 2026/);
  assert.ok(
    docContent.includes('not modified') || docContent.includes('NOT modified'),
  );
});

test('Documentation identifies daily_content wording as project editorial wording', () => {
  assert.ok(
    docContent.includes('project wording') || docContent.includes('Project wording') ||
    docContent.includes('Project editorial wording') || docContent.includes('project editorial wording'),
  );
  assert.ok(docContent.includes('ronbl'));
  assert.ok(docContent.includes('Public Domain'));
  assert.ok(docContent.includes('https://ebible.org/ronbl/'));
});
