/**
 * Exportul corpusului de conținut: funcțiile pure + fișierele generate.
 *
 * Ce dovedesc testele:
 *   A. escaping-ul SQL este corect (apostrof, linie nouă, diacritice, `null`, `text[]`, NUL refuzat);
 *   B. migrația construită este deterministă și idempotentă (același input ⇒ același text; `on conflict do nothing`);
 *   C. fișierele generate sunt auto-consistente (rândurile declarate în antet = tuplurile scrise) și
 *      complete (miile de rânduri sunt acolo, nu un eșantion);
 *   D. seed-urile nu conțin operații distructive și nu inventează conținut (toate valorile sunt literali);
 *   E. pipeline-ul e documentat, iar poarta de release îl recunoaște.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  CORPORA,
  buildSeedMigration,
  canonicalRowsHash,
  readSeedMigration,
  sqlLiteral,
  sqlTextArray,
} from '../scripts/bible-corpus-export.mjs';

const migrationPath = (corpus) => resolve('supabase/migrations', CORPORA[corpus].migration);

// ─── A · escaping ─────────────────────────────────────────────────────────────

test('A. textele SQL sunt escapate corect', () => {
  assert.equal(sqlLiteral("Pavel, chemat să fie apostol"), "'Pavel, chemat să fie apostol'");
  assert.equal(sqlLiteral("Născătoare de Dumnezeu, bucură-te"), "'Născătoare de Dumnezeu, bucură-te'");
  assert.equal(sqlLiteral("nu-i așa' zise el"), "'nu-i așa'' zise el'", 'apostroful se dublează');
  assert.equal(sqlLiteral("linia 1\nlinia 2"), "'linia 1\nlinia 2'", 'linia nouă rămâne în literal');
  assert.equal(sqlLiteral(null), 'null');
  assert.equal(sqlLiteral(undefined), 'null');
  assert.equal(sqlLiteral(true), 'true');
  assert.equal(sqlLiteral(false), 'false');
  assert.equal(sqlLiteral(42), '42');
  assert.equal(sqlLiteral(-1), '-1');
  assert.throws(() => sqlLiteral('text cu \u0000 în el'), /NUL/, 'un NUL nu poate ajunge în SQL');
  assert.throws(() => sqlLiteral(Number.POSITIVE_INFINITY), /nefinit/);
});

test('A. tablourile text[] sunt scrise ca array SQL', () => {
  assert.equal(sqlTextArray([]), "'{}'::text[]");
  assert.equal(sqlTextArray(['Sfântul Ion']), "array['Sfântul Ion']::text[]");
  assert.equal(sqlTextArray(["Sfântul Ion", "al doilea'"]), "array['Sfântul Ion', 'al doilea''']::text[]");
  assert.equal(sqlLiteral(['a', 'b']), "array['a', 'b']::text[]");
});

// ─── B · determinism și idempotență ───────────────────────────────────────────

const SAMPLE = [
  { translation_id: 'ronbl', book_code: 'TIT', chapter: 3, verse: 15, verse_text: 'Harul să fie cu voi toți.', is_published: true },
  { translation_id: 'ronbl', book_code: '1CO', chapter: 1, verse: 1, verse_text: "Pavel, chemat să fie apostol…", is_published: true },
];

test('B. același input produce exact același text (determinist)', () => {
  const first = buildSeedMigration({ corpus: 'bible', rows: SAMPLE, generatedAt: '2026-09-23T00:00:00.000Z', source: 'test' });
  const second = buildSeedMigration({ corpus: 'bible', rows: SAMPLE, generatedAt: '2026-09-23T00:00:00.000Z', source: 'test' });
  assert.equal(first, second);
  assert.equal(canonicalRowsHash(SAMPLE), canonicalRowsHash(SAMPLE));
  // Ordinea rândurilor contează pentru amprentă: e chiar scopul ei.
  assert.notEqual(canonicalRowsHash(SAMPLE), canonicalRowsHash([...SAMPLE].reverse()));
});

test('B. migrația construită este idempotentă și nu atinge rânduri existente', () => {
  const sql = buildSeedMigration({ corpus: 'prayers', rows: [{ id: '1', slug: 'x', category: 'c', title: 't', body: 'b', sort_order: 1, is_published: true, audio_path: null, country_code: null, language_code: 'ro', editorial_source: null }], generatedAt: 'x', source: 'test' });
  assert.match(sql, /insert into public\.prayers \(/);
  assert.match(sql, /\non conflict do nothing;\n?$/);
  assert.equal(/\b(update|delete|drop|truncate|alter)\b/i.test(sql), false, 'seed-ul nu modifică și nu șterge nimic');
});

// ─── C · fișierele generate ───────────────────────────────────────────────────

test('C. fiecare corpus are o migrație generată, auto-consistentă', () => {
  const minimums = { bible: 7000, prayers: 6, calendar: 5000 };
  for (const [corpus, spec] of Object.entries(CORPORA)) {
    const file = migrationPath(corpus);
    assert.ok(existsSync(file), `${spec.migration} trebuie să existe (npm run content:export)`);
    const parsed = readSeedMigration(file);
    assert.ok(parsed, `${spec.migration} trebuie citită`);
    const declared = Number.parseInt(/rânduri: (\d+)/.exec(parsed.text)?.[1] ?? '0', 10);
    assert.equal(parsed.rows, declared, `${spec.migration}: antetul declară ${String(declared)} rânduri, dar sunt ${String(parsed.rows)} tupluri`);
    assert.ok(declared >= minimums[corpus], `${spec.migration}: ${String(declared)} rânduri, sub minimul de ${String(minimums[corpus])}`);
    assert.match(parsed.text, /^-- Seed generat din baza reală/m);
    assert.match(parsed.text, /Amprenta rândurilor \(sha256[^)]*\): [0-9a-f]{64}/);
    assert.match(parsed.text, /on conflict do nothing;/);
  }
});

test('C. corpusul biblic conține cărți și versete reale, nu eșantioane', () => {
  const text = readFileSync(migrationPath('bible'), 'utf8');
  const books = new Set([...text.matchAll(/^ {2}\('ronbl', '([A-Z0-9]{3})'/gm)].map((match) => match[1]));
  assert.ok(books.size >= 27, `trebuie să fie toate cărțile Noului Testament, nu ${String(books.size)}`);
  assert.ok(books.has('TIT') && books.has('1CO') && books.has('MAT'));
  // Coloanele sunt declarate exact, iar fiecare tuplu se termină cu `is_published` boolean.
  assert.match(text, /insert into public\.bible_verses \(translation_id, book_code, chapter, verse, verse_text, is_published\)/);
  const tuples = text.match(/^ {2}\(.*\),?$/gm) ?? [];
  assert.ok(tuples.length >= 7000, `trebuie să fie toate versetele, nu ${String(tuples.length)}`);
  assert.equal(tuples.every((line) => /, (true|false)\),?$/.test(line)), true, 'fiecare tuplu se termină cu is_published boolean');
  assert.equal(/\[de completat|TODO|PLACEHOLDER/i.test(text), false, 'seed-ul nu are marcaje de completat');
});

test('C. rugăciunile au audio_path real, iar calendarul are codurile de calendar', () => {
  const prayers = readFileSync(migrationPath('prayers'), 'utf8');
  const audioPaths = [...prayers.matchAll(/'ro\/[a-z0-9-]+\.mp3'/g)].map((match) => match[0]);
  assert.ok(audioPaths.length >= 6, `trebuie să fie căile audio, nu ${String(audioPaths.length)}`);
  const calendar = readFileSync(migrationPath('calendar'), 'utf8');
  assert.match(calendar, /insert into public\.calendar_days \(id, calendar_code, calendar_date/);
  assert.ok((calendar.match(/^ {2}\('/gm) ?? []).length >= 5000);
});

// ─── D · ce nu are voie să apară ──────────────────────────────────────────────

test('D. seed-urile nu conțin operații distructive și nu ating timestamps', () => {
  for (const corpus of Object.keys(CORPORA)) {
    const text = readFileSync(migrationPath(corpus), 'utf8');
    assert.equal(/\b(delete from|truncate|drop table|alter table|update public\.)/i.test(text), false, `${corpus}: seed-ul trebuie să fie doar insert`);
    assert.equal(/created_at|updated_at/.test(text), false, `${corpus}: timestamps rămân pe valorile implicite`);
  }
});

// ─── E · pipeline-ul e documentat și recunoscut de poartă ─────────────────────

test('E. pipeline-ul e documentat și poarta de release îl recunoaște', () => {
  const doc = readFileSync(resolve('docs/BIBLE_CORPUS_PIPELINE.md'), 'utf8');
  for (const needle of ['npm run content:export', 'npm run content:export:check', 'on conflict do nothing', 'content-seeds.mjs', 'prayer-audio']) {
    assert.ok(doc.includes(needle), `docs/BIBLE_CORPUS_PIPELINE.md trebuie să spună ${needle}`);
  }
  const gate = readFileSync(resolve('scripts/release-readiness.mjs'), 'utf8');
  assert.match(gate, /bible-corpus-export\.mjs/);
  assert.match(gate, /BIBLE_CORPUS_PIPELINE\.md/);
  const status = readFileSync(resolve('docs/BIBLE_CONTENT_STATUS.md'), 'utf8');
  assert.match(status, /20260923000300_seed_bible_verses_corpus/, 'starea conținutului biblic trimite la seed-ul generat');
});
