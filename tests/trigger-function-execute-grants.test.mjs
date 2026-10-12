/**
 * A3-03 (12.10.2026) — EXECUTE pe funcțiile de trigger: clienții nu le pot chema.
 *
 * `handle_new_user()` (trigger AFTER INSERT pe auth.users) și `rls_auto_enable()`
 * (funcția event-trigger-ului `ensure_rls`) sunt SECURITY DEFINER. În Supabase,
 * `anon` și `authenticated` primesc EXECUTE prin PUBLIC pe orice funcție nouă din
 * `public`; regula din 08.10.2026 (v. rpc-execute-grants.test.mjs) cere revocare
 * explicită de la `public, anon, authenticated`.
 *
 * Migrația care le închide NU trebuie să atingă trigger-ele în sine și NU trebuie să
 * lase `supabase_auth_admin` fără EXECUTE (GoTrue creează conturile; el era acoperit
 * doar de grant-ul PUBLIC).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const MIGRATION = '20261012000200_revoke_trigger_function_execute_from_clients.sql';
const SQL = readFileSync(join(MIGRATIONS, MIGRATION), 'utf8');

const migrationFiles = readdirSync(MIGRATIONS)
  .filter((file) => file.endsWith('.sql'))
  .sort();

/** Comentariile se scot înainte de potriviri: verificăm cod, nu proză. */
const stripSqlComments = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');
const BODY = stripSqlComments(SQL);

test('1. ambele funcții de trigger sunt revocate de la PUBLIC, anon și authenticated', () => {
  for (const fn of ['public.handle_new_user()', 'public.rls_auto_enable()']) {
    const re = new RegExp(
      `revoke\\s+all\\s+on\\s+function\\s+${fn.replace(/[().]/g, '\\$&')}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`,
      'i',
    );
    assert.match(SQL, re, `${fn}: lipsește revoke-ul explicit de la public, anon, authenticated`);
  }
});

test('2. supabase_auth_admin păstrează EXECUTE pe handle_new_user (GoTrue creează conturi)', () => {
  assert.match(
    BODY,
    /grant\s+execute\s+on\s+function\s+public\.handle_new_user\(\)\s+to[^;]*\bsupabase_auth_admin\b/i,
    'fără acest GRANT, conturile noi ar depinde de un privilegiu implicit',
  );
  assert.match(
    BODY,
    /grant\s+execute\s+on\s+function\s+public\.rls_auto_enable\(\)\s+to[^;]*\bsupabase_admin\b/i,
    'DDL-ul de platformă trece prin supabase_admin; funcția event-trigger trebuie executabilă de el',
  );
});

test('3. nicio migrație nu re-acordă EXECUTE pe aceste funcții către clienți', () => {
  for (const file of migrationFiles) {
    const sql = stripSqlComments(readFileSync(join(MIGRATIONS, file), 'utf8'));
    const re = /grant\s+execute\s+on\s+function\s+public\.(handle_new_user|rls_auto_enable)\s*\(\)\s+to\s+([^;]*);/gi;
    let match;
    while ((match = re.exec(sql)) !== null) {
      const roles = match[2].toLowerCase();
      assert.equal(
        /\b(anon|authenticated|public)\b/.test(roles),
        false,
        `${file}: GRANT către client (${match[2].trim()}) anulează A3-03`,
      );
    }
  }
});

test('4. migrația nu atinge trigger-ele, RLS-ul sau definițiile funcțiilor', () => {
  assert.equal(/\bcreate\s+(or\s+replace\s+)?(function|trigger|event\s+trigger)\b/i.test(BODY), false,
    'A3-03 schimbă doar privilegii: definițiile rămân neatinse');
  assert.equal(/\b(drop\s+trigger|alter\s+trigger|eliminate\s+trigger)\b/i.test(BODY), false);
  assert.equal(/\b(create|drop|alter)\s+polic(y|ies)\b|\brow\s+level\s+security\b/i.test(BODY), false,
    'nicio politică RLS nu are ce căuta aici');
});

test('5. migrația e idempotentă și ordonată după cea de drepturi de tabel', () => {
  // REVOKE/GRANT sunt idempotente prin natura lor; verificăm doar ordinea fișierelor.
  const idx = migrationFiles.indexOf(MIGRATION);
  assert.ok(idx > migrationFiles.indexOf('20261012000100_revoke_client_dml_on_server_tables.sql'));
  assert.equal(
    /create\s+table|insert\s+into|update\s+public\.|delete\s+from/i.test(BODY),
    false,
    'A3-03 nu scrie date',
  );
});
