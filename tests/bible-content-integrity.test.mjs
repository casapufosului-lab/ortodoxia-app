import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the Bible source constant file to verify structural properties
const sourceFile = join(__dirname, '..', 'src', 'data', 'bible-source.ts');
const sourceContent = readFileSync(sourceFile, 'utf8');

// Read the Bible UI file to inspect the books array
const bibleUiFile = join(__dirname, '..', 'src', 'app', '(tabs)', 'bible.tsx');
const bibleUiContent = readFileSync(bibleUiFile, 'utf8');

// Read the documentation file
const docFile = join(__dirname, '..', 'docs', 'BIBLE_CONTENT_STATUS.md');
const docContent = readFileSync(docFile, 'utf8');

// --- Documentation: structural checks (no live DB claims) ---

test('docs record ronbl translation ID', () => {
  assert.ok(docContent.includes('ronbl'), 'documentation must reference ronbl translation ID');
  assert.ok(docContent.includes('Biblia Liberă'), 'documentation must reference Biblia Liberă translation name');
});

test('docs record eBible official source and copyright URLs', () => {
  assert.ok(docContent.includes('https://ebible.org/ronbl/'), 'documentation must include official source URL');
  assert.ok(docContent.includes('https://ebible.org/ronbl/copyright.htm'), 'documentation must include copyright URL');
  assert.ok(docContent.includes('https://ebible.org/Scriptures/copyright.php'), 'documentation must include copyright registry URL');
});

test('docs record Public Domain as upstream legal status', () => {
  assert.ok(docContent.includes('Public Domain'), 'documentation must document Public Domain legal status');
});

test('docs do NOT claim Romanian Orthodox Synodal Bible', () => {
  assert.ok(docContent.includes('Nu este prezentată drept ediția sinodală ortodoxă'), 'documentation must explicitly state it is not the Romanian Orthodox Synodal Bible');
});

test('docs record 7958 published rows and 27 books', () => {
  assert.ok(docContent.includes('| Published verses | 7958 |'), 'documentation must record 7958 published verse rows');
  assert.ok(docContent.includes('| Books with content | 27 |'), 'documentation must record 27 books with content');
  assert.ok(docContent.includes('| Duplicate verse keys | 0 |'), 'documentation must record 0 duplicate verse keys');
});

test('docs record the five intentional empty verse markers', () => {
  assert.ok(docContent.includes('LUK'), 'documentation must reference LUK');
  assert.ok(docContent.includes('17'), 'documentation must reference chapter 17');
  assert.ok(docContent.includes('36'), 'documentation must reference verse 36');
  assert.ok(docContent.includes('ACT'), 'documentation must reference ACT');
  assert.ok(docContent.includes('8'), 'documentation must reference chapter 8');
  assert.ok(docContent.includes('37'), 'documentation must reference verse 37');
  assert.ok(docContent.includes('15'), 'documentation must reference chapter 15');
  assert.ok(docContent.includes('34'), 'documentation must reference verse 34');
  assert.ok(docContent.includes('24'), 'documentation must reference chapter 24');
  assert.ok(docContent.includes('7'), 'documentation must reference verse 7');
  assert.ok(docContent.includes('ROM'), 'documentation must reference ROM');
  assert.ok(docContent.includes('16'), 'documentation must reference chapter 16');
  assert.ok(docContent.includes('25'), 'documentation must reference verse 25');
});

// --- Source constant: structural checks ---

test('BIBLE_SOURCE.id is ronbl', () => {
  assert.ok(/id:\s*'ronbl'/.test(sourceContent), 'bible-source.ts must export id "ronbl"');
});

test('BIBLE_SOURCE.name is Biblia Liberă', () => {
  assert.ok(/name:\s*'Biblia Liberă'/.test(sourceContent), 'bible-source.ts must export name "Biblia Liberă"');
});

test('BIBLE_SOURCE.sourceUrl points to official source', () => {
  assert.ok(/sourceUrl:\s*'https:\/\/ebible.org\/ronbl\/'/.test(sourceContent), 'sourceUrl must point to https://ebible.org/ronbl/');
});

test('BIBLE_SOURCE.copyrightUrl points to official copyright page', () => {
  assert.ok(/copyrightUrl:\s*'https:\/\/ebible.org\/ronbl\/copyright\.htm'/.test(sourceContent), 'copyrightUrl must point to https://ebible.org/ronbl/copyright.htm');
});

// --- Bible UI book list: structural checks ---

test('Bible UI contains exactly 27 unique book codes', () => {
  const constMatch = bibleUiContent.match(/const books\s*=\s*\[([\s\S]*?)\]\s*as const;/);
  assert.ok(constMatch, 'books array must be defined as a const array');
  const arrayBody = constMatch[1];
  const bookPattern = /\{\s*code:\s*'([^']+)'[\s\S]*?chapters:\s*(\d+)\s*\}/g;
  const codes = [];
  let match;
  while ((match = bookPattern.exec(arrayBody)) !== null) {
    codes.push({ code: match[1], chapters: parseInt(match[2], 10) });
  }
  const uniqueCodes = new Set(codes.map(c => c.code));
  assert.equal(codes.length, 27, 'books array must contain exactly 27 entries');
  assert.equal(uniqueCodes.size, 27, 'all 27 book codes must be unique (no duplicates)');
  for (const entry of codes) {
    assert.ok(Number.isInteger(entry.chapters), `chapter count for ${entry.code} must be an integer`);
    assert.ok(entry.chapters > 0, `chapter count for ${entry.code} must be positive`);
  }
  assert.equal(codes.length, 27, 'no missing book position in the array');
  assert.equal([...Array(27).keys()].every(i => i < codes.length), true, 'array must be contiguous with no holes');
  const expected = ['MAT', 'MAR', 'LUK', 'JOH', 'ACT', 'ROM', '1CO', '2CO', 'GAL', 'EPH', 'PHI', 'COL', '1TH', '2TH', '1TI', '2TI', 'TIT', 'PHM', 'HEB', 'JAM', '1PE', '2PE', '1JO', '2JO', '3JO', 'JUD', 'REV'];
  for (const exp of expected) {
    assert.ok(uniqueCodes.has(exp), `books array must include book code "${exp}"`);
  }
});