/**
 * A3-01 (12.10.2026) — regula de siguranță, închisă în cod.
 *
 * Înainte de a revoca INSERT/UPDATE/DELETE pe un tabel, trebuie știut dacă CLIENTUL
 * scrie în el prin PostgREST. Nu se revocă nimic pe tabelele scrise de aplicație,
 * altfel `npm test` ar trece, dar funcția din aplicație ar lua 401/403 în producție.
 *
 * Testul de față:
 *   1. re-derivă lista tabelelor scrise de client direct din `src/**`
 *      (`.from('<tabel>').insert|update|upsert|delete`, fereastră de 400 de caractere
 *      după `from(...)` — același detector ca scanarea care a precedat migrația);
 *   2. compară lista cu migrația `20261012000100_revoke_client_dml_on_server_tables.sql`.
 *
 * De aceea testul nu e o formalitate: dacă mâine aplicația începe să scrie într-un
 * tabel pe care l-am revocat, testul cade ÎNAINTE ca regresia să ajungă în bază.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = '20261012000100_revoke_client_dml_on_server_tables.sql';
const SQL = readFileSync(join(ROOT, 'supabase', 'migrations', MIGRATION), 'utf8');

/** Operația care urmează imediat în lanțul Supabase, în fereastra de 400 de caractere. */
const OP_RE = /\.(insert|update|upsert|delete|select)\s*\(/;
const FROM_RE = /\.from\(\s*['"`]([a-z_][a-z0-9_]*)['"`]\s*\)/g;

/**
 * Tabelele scrise de CLIENT prin PostgREST (doar `src/**`; funcțiile Edge scriu cu
 * `service_role` și nu intră în regula asta).
 */
export function clientWriteOps(root = ROOT) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry)) files.push(full);
    }
  };
  walk(join(root, 'src'));

  const writes = new Map();
  const reads = new Set();
  for (const file of files) {
    // Textul de confidențialitate pomenește nume de tabele; nu e cod.
    if (/[\\/]i18n[\\/]config\.ts$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    FROM_RE.lastIndex = 0;
    let match;
    while ((match = FROM_RE.exec(text)) !== null) {
      const op = OP_RE.exec(text.slice(match.index, match.index + 400))?.[1];
      if (!op) continue;
      if (op === 'select') {
        reads.add(match[1]);
        continue;
      }
      if (!writes.has(match[1])) writes.set(match[1], new Set());
      writes.get(match[1]).add(op);
    }
  }
  return { writes, reads, fileCount: files.length };
}

/**
 * Comentariile de SQL se scot înainte de orice potrivire de tipar: altfel cuvântul
 * „REVOKE" dintr-un antet de comentariu (scris în română, fără `;`) ar lipi textul
 * până la prima instrucțiune reală și verificarea ar compara altceva decât crede.
 */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\r\n]*/g, ' ');
}

/** `revoke <privilegii> on public.<tabel> from <roluri>;` → hartă tabel → detalii. */
export function parseRevokes(sql) {
  const revokes = new Map();
  const clean = stripSqlComments(sql);
  const re = /revoke\s+([^;]*?)\s+on\s+public\.([a-z_]+)\s+from\s+([^;]*);/gi;
  let match;
  while ((match = re.exec(clean)) !== null) {
    revokes.set(match[2], {
      privileges: match[1]
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean),
      roles: match[3]
        .split(',')
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean),
    });
  }
  return revokes;
}

/**
 * Înghețat 12.10.2026, la momentul aplicării în baza LIVE: exact aceste 15 tabele au
 * fost revocate, exact aceste 7 tabele scrise de client au fost lăsate în pace.
 */
const FROZEN_REVOKED = [
  'ai_client_usage_daily',
  'ai_usage_monthly',
  'bible_verses',
  'calendar_day_translations',
  'calendar_days',
  'chat_messages',
  'daily_content',
  'guest_usage_daily',
  'live_service_status_cache',
  'notification_deliveries',
  'notification_device_claims',
  'notification_messages',
  'prayers',
  'subscriptions',
  'usage_daily',
];

const FROZEN_CLIENT_WRITTEN = {
  ai_reports: ['insert'],
  chat_threads: ['delete'],
  favorites: ['delete', 'insert'],
  notification_devices: ['update'],
  notification_preferences: ['update', 'upsert'],
  profiles: ['update'],
  verse_favorites: ['delete', 'insert'],
};

test('1. migrația revocă pe exact tabelele server-only înghețate', () => {
  const revokes = parseRevokes(SQL);
  assert.deepEqual(
    [...revokes.keys()].sort(),
    [...FROZEN_REVOKED].sort(),
    'lista de tabele revocate din migrație trebuie să fie exact cea aplicată în baza LIVE',
  );
});

test('2. fiecare REVOKE scoate toate cele trei privilegii, de la ambele roluri de client', () => {
  for (const [table, { privileges, roles }] of parseRevokes(SQL)) {
    assert.deepEqual(
      [...privileges].sort(),
      ['delete', 'insert', 'update'],
      `${table}: trebuie revocate exact INSERT, UPDATE și DELETE`,
    );
    assert.deepEqual(
      [...roles].sort(),
      ['anon', 'authenticated'],
      `${table}: trebuie vizate exact rolurile anon și authenticated`,
    );
  }
});

test('3. regulă de siguranță: niciun tabel scris de CLIENT nu apare în migrație', () => {
  const { writes } = clientWriteOps();
  const revoked = new Set(parseRevokes(SQL).keys());
  const violations = [...writes.keys()].filter((t) => revoked.has(t));
  assert.deepEqual(
    violations,
    [],
    `scanarea src/** arată că clientul scrie în ${violations.join(', ')} — nu se revocă nimic pe ele`,
  );
});

test('4. lista înghețată a tabelelor scrise de client corespunde încă scanării src/**', () => {
  const { writes, fileCount } = clientWriteOps();
  assert.ok(fileCount > 50, `scanarea a citit doar ${fileCount} fișiere — verifică walk-ul, nu înghețul`);

  for (const [table, expectedOps] of Object.entries(FROZEN_CLIENT_WRITTEN)) {
    const actual = writes.get(table);
    assert.ok(actual, `${table} nu mai apare ca tabel scris de client — dacă chiar nu se mai scrie în el, scoate-l din îngheț cu dovezi`);
    for (const op of expectedOps) {
      assert.ok(actual.has(op), `${table}: operația ${op} din îngheț nu mai există în src/**`);
    }
  }
});

test('5. migrația nu dă înapoi clientului niciun drept de scriere', () => {
  const body = stripSqlComments(SQL);
  assert.equal(
    /grant[^;]*\bto\b[^;]*\b(anon|authenticated|public)\b/i.test(body),
    false,
    'un GRANT către anon/authenticated/public ar anula revocarea',
  );
});

test('6. migrația nu atinge nicio politică RLS', () => {
  const body = stripSqlComments(SQL);
  assert.equal(
    /\b(create|drop|alter)\s+polic(y|ies)\b|\brow\s+level\s+security\b/i.test(body),
    false,
    'A3-01 schimbă doar privilegii de tabel; RLS rămâne exact cum e',
  );
});
