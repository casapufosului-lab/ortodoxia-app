/**
 * Exportul corpusului de conținut din baza reală în migrații de seed.
 *
 * DE CE EXISTĂ
 * ------------
 * `docs/BIBLE_CONTENT_STATUS.md` spunea adevărul supărător: cele 7 958 de versete, rugăciunile cu
 * `audio_path` și calendarul trăiau DOAR în baza remote. Dacă proiectul Supabase se pierdea, conținutul
 * (muncă editorială verificată) se pierdea cu el, iar baza nu putea fi reconstruită din depozit.
 *
 * Ce face: citește tabelele prin PostgREST (cu cheia de service, din mediu — niciodată din depozit),
 * scrie migrații SQL deterministe și IDEMPOTENTE (`on conflict do nothing`), cu un hash al rândurilor
 * în antet, ca o re-exportare ulterioară să poată fi comparată.
 *
 * Rulare:
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run content:export
 *   npm run content:export -- --only bible          (doar o tabelă)
 *   npm run content:export -- --check               (compară ce e pe disc cu ce e în bază, fără să scrie)
 *
 * CE NU FACE: nu inventează conținut, nu modifică baza (doar citește), nu publică nimic. Migrațiile
 * generate se aplică apoi cu `npx supabase db push`, iar pe o bază deja populată nu schimbă niciun rând.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Descrierea fiecărui corpus: tabelul, coloanele, ordinea stabilă și fișierul de migrație. */
export const CORPORA = {
  bible: {
    table: 'bible_verses',
    columns: ['translation_id', 'book_code', 'chapter', 'verse', 'verse_text', 'is_published'],
    orderBy: ['translation_id', 'book_code', 'chapter', 'verse'],
    migration: '20260923000300_seed_bible_verses_corpus.sql',
    label: 'corpusul biblic',
  },
  prayers: {
    table: 'prayers',
    columns: ['id', 'slug', 'category', 'country_code', 'language_code', 'title', 'body', 'editorial_source', 'sort_order', 'is_published', 'audio_path'],
    orderBy: ['slug'],
    migration: '20260923000400_seed_prayers_with_audio.sql',
    label: 'rugăciunile (cu audio_path)',
  },
  calendar: {
    table: 'calendar_days',
    columns: ['id', 'calendar_code', 'calendar_date', 'country_code', 'language_code', 'feast_rank', 'feast_rank_code', 'saints', 'title', 'details', 'fasting_note', 'editorial_source', 'is_published'],
    orderBy: ['calendar_code', 'calendar_date'],
    migration: '20260923000500_seed_calendar_days_corpus.sql',
    label: 'calendarul',
  },
};

/** Un text SQL sigur. `standard_conforming_strings` este activ pe Supabase, deci backslash-ul e literal. */
export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`număr nefinit în export: ${String(value)}`);
    return String(value);
  }
  if (Array.isArray(value)) return sqlTextArray(value);
  const text = String(value);
  if (text.includes('\u0000')) throw new Error('textul conține NUL, nu poate fi scris în SQL');
  return `'${text.replace(/'/g, "''")}'`;
}

/** Un `text[]` SQL (folosit de `calendar_days.saints`). */
export function sqlTextArray(values) {
  if (!Array.isArray(values) || values.length === 0) return `'{}'::text[]`;
  return `array[${values.map((item) => sqlLiteral(String(item))).join(', ')}]::text[]`;
}

/** Amprenta rândurilor, ca o re-exportare să poată fi comparată cu cea de dinainte. */
export function canonicalRowsHash(rows) {
  const canonical = rows.map((row) => JSON.stringify(row));
  return createHash('sha256').update(canonical.join('\n')).digest('hex');
}

/**
 * Construiește migrația. `on conflict do nothing` (fără țintă) acoperă orice constrângere, deci seed-ul
 * este idempotent pe orice bază: pe una goală inserează tot, pe una populată nu atinge nimic.
 */
export function buildSeedMigration({ corpus, rows, generatedAt, source }) {
  const spec = CORPORA[corpus];
  if (spec === undefined) throw new Error(`corpus necunoscut: ${corpus}`);
  const hash = canonicalRowsHash(rows);
  const chunks = [];
  chunks.push(
    `-- Seed generat din baza reală — ${spec.label} (${spec.table}).`,
    `-- Generat: ${generatedAt} | rânduri: ${rows.length} | sursă: ${source}`,
    `-- Amprenta rândurilor (sha256, în ordinea de mai jos): ${hash}`,
    '--',
    '-- DE CE: conținutul editorial trăia doar în baza remote; fără acest seed, baza nu putea fi reconstruită',
    '-- din depozit, iar o pierdere a proiectului Supabase ar fi însemnat pierderea lui.',
    '--',
    '-- IDEMPOTENT: `on conflict do nothing` nu modifică niciun rând existent. Pe o bază populată, rularea',
    '-- acestei migrații nu schimbă nimic; pe una goală, inserează exact rândurile exportate.',
    '-- Nu inventează conținut: fiecare valoare vine din baza reală, la data de mai sus.',
    '',
    `insert into public.${spec.table} (${spec.columns.join(', ')})`,
    'values',
  );
  const tuples = rows.map((row) => `  (${spec.columns.map((column) => sqlLiteral(row[column])).join(', ')})`);
  chunks.push(`${tuples.join(',\n')}`, 'on conflict do nothing;', '');
  return chunks.join('\n');
}

/** Rândurile dintr-o migrație deja scrisă: numărul de tupluri și amprenta declarată în antet. */
export function readSeedMigration(file) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const rows = (text.match(/^ {2}\(/gm) ?? []).length;
  const hash = /Amprenta rândurilor \(sha256[^)]*\): ([0-9a-f]{64})/.exec(text)?.[1] ?? null;
  return { text, rows, hash };
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function fail(message) {
  console.log(`NU S-A SCRIS NIMIC: ${message}`);
  process.exit(1);
}

/** Paginează un tabel prin PostgREST, cu ordine stabilă (altfel hash-ul nu e reproductibil). */
async function fetchAll(url, serviceKey, spec) {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const query = `select=${spec.columns.join(',')}&order=${spec.orderBy.join('.asc,')}.asc&limit=${String(pageSize)}&offset=${String(offset)}`;
    const response = await fetch(`${url}/rest/v1/${spec.table}?${query}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`${spec.table}: PostgREST a răspuns ${String(response.status)} ${await response.text()}`);
    }
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`${spec.table}: răspuns neașteptat`);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function main() {
  const url = (process.env.SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (url === '' || serviceKey === '') {
    fail('lipsesc SUPABASE_URL și/sau SUPABASE_SERVICE_ROLE_KEY din mediu (cheia NU se scrie în depozit)');
  }

  const onlyIndex = process.argv.indexOf('--only');
  const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
  const checkOnly = process.argv.includes('--check');
  const targets = only === null ? Object.keys(CORPORA) : [only];
  for (const target of targets) {
    if (CORPORA[target] === undefined) fail(`corpus necunoscut: ${String(target)} (folosește ${Object.keys(CORPORA).join(', ')})`);
  }

  const generatedAt = new Date().toISOString();
  const migrationsDir = join(ROOT, 'supabase', 'migrations');
  if (!checkOnly) mkdirSync(migrationsDir, { recursive: true });

  let drifted = 0;
  for (const target of targets) {
    const spec = CORPORA[target];
    const rows = await fetchAll(url, serviceKey, spec);
    const hash = canonicalRowsHash(rows);
    const file = join(migrationsDir, spec.migration);
    const existing = readSeedMigration(file);
    console.log(`${target}: ${String(rows.length)} rânduri · sha256 ${hash.slice(0, 16)}…`);

    if (checkOnly) {
      if (existing === null) {
        console.log(`  LIPSĂ ${spec.migration}`);
        drifted += 1;
      } else if (existing.hash !== hash) {
        console.log(`  DIFERIT ${spec.migration}: pe disc ${String(existing.rows)} rânduri (${String(existing.hash?.slice(0, 16) ?? '?')}…), în bază ${String(rows.length)}`);
        drifted += 1;
      } else {
        console.log(`  identic ${spec.migration}`);
      }
      continue;
    }

    const migration = buildSeedMigration({ corpus: target, rows, generatedAt, source: `${url}/rest/v1/${spec.table}` });
    writeFileSync(file, migration, 'utf8');
    console.log(`  scris ${join('supabase', 'migrations', spec.migration)} (${String(Math.round(migration.length / 1024))} KB)`);
  }

  if (checkOnly) {
    console.log(drifted === 0 ? '\nOK — migrațiile de pe disc corespund bazei reale.' : `\n${String(drifted)} corpus(uri) diferă de baza reală.`);
    process.exit(drifted === 0 ? 0 : 1);
  }
  console.log('\nPasul următor: npm run verify (sau npx supabase db push --linked --yes) — pe o bază populată nu schimbă nimic.');
}

// Rulează doar când e chemat ca script (nu la import, ca testele să poată folosi funcțiile pure).
if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  await main();
}
