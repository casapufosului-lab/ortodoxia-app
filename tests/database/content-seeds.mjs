// Rulează doar pe un motor PGlite proaspăt, în memorie. Nu folosește niciodată un URL de server.
// Usage: node tests/database/content-seeds.mjs <cale absolută către @electric-sql/pglite/dist/index.js>
//
// Dovedește că migrațiile de conținut generate din baza reală (versete, rugăciuni cu audio_path,
// calendar) SE EXECUTĂ pe un PostgreSQL real, că aduc exact atâtea rânduri câte declară antetul și că
// sunt idempotente (a doua rulare nu schimbă nimic).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
let checks = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); checks++; };

const seedFile = (name) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
const declaredRows = (sql) => Number.parseInt(/rânduri: (\d+)/.exec(sql)?.[1] ?? '0', 10);

const SEEDS = [
  { table: 'bible_verses', file: '20260923000300_seed_bible_verses_corpus' },
  { table: 'prayers', file: '20260923000400_seed_prayers_with_audio' },
  { table: 'calendar_days', file: '20260923000500_seed_calendar_days_corpus' },
];

try {
  // Schema minimă, copiată fidel din migrațiile reale (chei primare, unicitate, tipuri).
  await db.exec(`
    create table public.bible_verses (
      translation_id text not null,
      book_code text not null,
      chapter integer not null check (chapter > 0),
      verse integer not null check (verse > 0),
      verse_text text not null,
      is_published boolean not null default true,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now()),
      primary key (translation_id, book_code, chapter, verse)
    );
    create table public.prayers (
      id uuid primary key default gen_random_uuid(),
      slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
      category text not null,
      title text not null,
      body text not null,
      editorial_source text,
      sort_order integer not null default 0,
      is_published boolean not null default false,
      audio_path text,
      country_code text,
      language_code text,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
    create table public.calendar_days (
      id uuid primary key default gen_random_uuid(),
      -- Fără constrângere unique pe calendar_date: migrația 20260830000200 a eliminat-o și a pus
      -- (country_code, language_code, calendar_code, calendar_date), exact ca mai jos.
      calendar_date date not null,
      feast_rank text,
      saints text[] not null default '{}',
      title text not null,
      details text,
      fasting_note text,
      editorial_source text,
      is_published boolean not null default false,
      country_code text check (country_code is null or country_code ~ '^[A-Z]{2}$'),
      language_code text not null default 'ro' check (language_code ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
      calendar_code text not null default 'ro-bor' check (calendar_code ~ '^[a-z0-9-]{3,40}$'),
      feast_rank_code text,
      created_at timestamptz not null default timezone('utc', now()),
      updated_at timestamptz not null default timezone('utc', now())
    );
    create unique index calendar_days_region_date_idx
      on public.calendar_days(country_code, language_code, calendar_code, calendar_date);
  `);

  for (const seed of SEEDS) {
    const sql = seedFile(seed.file);
    const expected = declaredRows(sql);

    await db.exec(sql);
    const after = (await db.query(`select count(*)::int as count from public.${seed.table}`)).rows[0].count;
    check(after, expected);
    check(after > 0, true);

    // Idempotență: a doua rulare nu adaugă și nu modifică nimic.
    await db.exec(sql);
    const again = (await db.query(`select count(*)::int as count from public.${seed.table}`)).rows[0].count;
    check(again, expected);

    // Valorile chiar au ajuns acolo (nu doar numărul): un text cunoscut și un câmp specific.
    if (seed.table === 'bible_verses') {
      const tit = (await db.query("select verse_text from public.bible_verses where book_code = 'TIT' and chapter = 3 and verse = 15")).rows[0].verse_text;
      check(typeof tit, 'string');
      check(tit.includes('Harul'), true);
      const books = (await db.query('select count(distinct book_code)::int as books from public.bible_verses')).rows[0].books;
      check(books >= 27, true);
    }
    if (seed.table === 'prayers') {
      const audio = (await db.query('select count(*)::int as count from public.prayers where audio_path is not null')).rows[0].count;
      check(audio, 10);
      const slug = (await db.query("select title from public.prayers where slug = 'tatal-nostru'")).rows[0].title;
      check(slug, 'Tatăl nostru');
    }
    if (seed.table === 'calendar_days') {
      const codes = (await db.query('select count(distinct calendar_code)::int as codes from public.calendar_days')).rows[0].codes;
      check(codes > 1, true);
      const published = (await db.query('select count(*)::int as count from public.calendar_days where is_published')).rows[0].count;
      check(published > 0, true);
    }
  }

  // O bază goală, reconstruită din seed-uri, are EXACT conținutul exportat: asta e tot rostul.
  const totals = (await db.query(`
    select (select count(*)::int from public.bible_verses) as verses,
           (select count(*)::int from public.prayers) as prayers,
           (select count(*)::int from public.calendar_days) as days
  `)).rows[0];
  check(totals.verses, declaredRows(seedFile('20260923000300_seed_bible_verses_corpus')));
  check(totals.prayers, declaredRows(seedFile('20260923000400_seed_prayers_with_audio')));
  check(totals.days, declaredRows(seedFile('20260923000500_seed_calendar_days_corpus')));

  console.log(`PASS: ${checks} database assertions on generated content seeds`);
} finally {
  await db.close();
}
