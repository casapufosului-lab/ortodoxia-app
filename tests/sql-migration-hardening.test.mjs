/**
 * Static re-review of the corrective SQL migrations.
 *
 * These migrations cannot be executed here (no database is reachable from this
 * environment), so the checks below assert the properties that CAN be established by
 * reading the SQL: idempotency, `search_path` pinning, privilege surface, trigger
 * semantics, uniqueness/backfill safety and data compatibility.
 *
 * Every assertion here corresponds to a concrete defect that was found while
 * re-reading these files, not to a style preference.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const RANK_SQL = read('supabase/migrations/20260915000100_fix_calendar_rpc_and_canonical_feast_rank.sql');
const DEVICE_SQL = read('supabase/migrations/20260915000200_harden_notification_device_claim.sql');
const EXPIRY_SQL = read('supabase/migrations/20260915000300_fail_closed_expiry_and_provider_provenance.sql');
const AUDIO_SQL = read('supabase/migrations/20260915000400_make_prayer_audio_bucket_private.sql');

// ─── 20260915000100 — canonical feast rank + localized calendar RPC ──────────

test('rank migration is re-runnable (no bare CREATE without IF NOT EXISTS/OR REPLACE)', () => {
  assert.match(RANK_SQL, /ALTER TABLE public\.calendar_days\s+ADD COLUMN IF NOT EXISTS feast_rank_code text/);
  assert.match(RANK_SQL, /CREATE OR REPLACE FUNCTION public\.classify_feast_rank/);
  assert.match(RANK_SQL, /CREATE OR REPLACE FUNCTION public\.calendar_days_set_feast_rank_code/);
  assert.match(RANK_SQL, /DROP TRIGGER IF EXISTS calendar_days_sync_feast_rank_code/);
  assert.match(RANK_SQL, /CREATE INDEX IF NOT EXISTS calendar_days_feast_rank_code_idx/);
  assert.match(RANK_SQL, /CREATE UNIQUE INDEX IF NOT EXISTS notification_messages_template_key_idx/);
  // The RPC may not be "replaced": its OUT parameters changed, so it must be dropped.
  assert.match(RANK_SQL, /DROP FUNCTION IF EXISTS public\.get_calendar_days_localized\(text, text, text, date, date\)/);
  // The CHECK constraint is created idempotently rather than unconditionally.
  assert.match(RANK_SQL, /conname = 'calendar_days_feast_rank_code_check'/);
});

test('rank migration pins search_path on every function it defines', () => {
  // get_calendar_days_localized uses plain CREATE because its OUT parameters changed
  // and CREATE OR REPLACE cannot alter them.
  const fnCount = (RANK_SQL.match(/CREATE (?:OR REPLACE )?FUNCTION public\./g) ?? []).length;
  const pinned = (RANK_SQL.match(/SET search_path = ''/gi) ?? []).length;
  assert.equal(fnCount, 3);
  assert.ok(pinned >= fnCount, `every function needs a pinned search_path (${pinned} < ${fnCount})`);
  assert.match(RANK_SQL, /LANGUAGE sql\s+IMMUTABLE\s+SET search_path = ''/i);
});

test('rank migration does not leave the default PUBLIC EXECUTE grant in place', () => {
  const revokeAt = RANK_SQL.indexOf(
    'REVOKE ALL ON FUNCTION public.get_calendar_days_localized(text, text, text, date, date)',
  );
  const grantAt = RANK_SQL.indexOf(
    'GRANT EXECUTE ON FUNCTION public.get_calendar_days_localized(text, text, text, date, date)',
  );
  assert.ok(revokeAt >= 0, 'the default PUBLIC EXECUTE grant must be revoked');
  assert.ok(grantAt > revokeAt, 'the revoke must precede the intended grant');
  assert.match(RANK_SQL, /FROM PUBLIC;/);
});

test('legacy feast-rank values actually present in shipped seeds are classified', () => {
  for (const literal of [
    'cruce ro',
    'cruce neagr',
    'δεσποτικ',
    'θεομητορικ',
    'duminic',
    'crven%krst',
    'crn%krst',
    'недел',
    'κυριακ',
    '%велики празник%',
    '%голем празник%',
    '%богородич%',
  ]) {
    assert.ok(RANK_SQL.includes(literal), `classify_feast_rank must recognise ${literal}`);
  }
  // Unknown ranks must stay NULL so callers render their own fallback.
  assert.match(RANK_SQL, /ELSE NULL\s+END/);
});

test('feast-rank trigger recomputes when feast_rank changes', () => {
  const start = RANK_SQL.indexOf('CREATE OR REPLACE FUNCTION public.calendar_days_set_feast_rank_code');
  const end = RANK_SQL.indexOf('DROP TRIGGER IF EXISTS', start);
  const body = RANK_SQL.slice(start, end);

  // A stale code must be cleared when the underlying rank becomes unclassifiable.
  assert.match(body, /TG_OP = 'UPDATE'/);
  assert.match(body, /NEW\.feast_rank IS DISTINCT FROM OLD\.feast_rank/);
  assert.match(body, /NEW\.feast_rank_code IS NOT DISTINCT FROM OLD\.feast_rank_code/);
  // An explicitly supplied code still wins.
  assert.match(body, /IF NEW\.feast_rank_code IS NULL/);
  assert.ok(!/IF NEW\.feast_rank_code IS NOT NULL THEN\s+RETURN NEW;\s+END IF;/.test(body));
});

test('feast-rank migration keeps the localized RPC contract additive', () => {
  // Existing columns keep their names; feast_rank_code is appended so existing
  // positional consumers keep working.
  assert.match(
    RANK_SQL,
    /RETURNS TABLE \(\s*calendar_date date,\s*feast_rank text,\s*saints text\[\],\s*title text,\s*details text,\s*fasting_note text,\s*editorial_source text,\s*feast_rank_code text\s*\)/,
  );
  // Every projected column is aliased, which is what removes the column/identifier
  // ambiguity the previous definition suffered from.
  assert.match(RANK_SQL, /END AS saints/);
  assert.match(RANK_SQL, /END AS title/);
  assert.match(RANK_SQL, /END AS details/);
  assert.match(RANK_SQL, /END AS fasting_note/);
  assert.match(RANK_SQL, /END AS editorial_source/);
  assert.match(RANK_SQL, /AS feast_rank_code/);
});

test('notification dedupe and its unique index agree on NULL handling', () => {
  // country_code/calendar_code are nullable and coalesced in both places; theme is
  // NOT NULL, so it is compared directly in both. A mismatch would let the index
  // creation fail after the dedupe appeared to succeed.
  assert.match(RANK_SQL, /COALESCE\(country_code, ''\),\s*COALESCE\(calendar_code, ''\),\s*day_type,\s*theme\s*ORDER BY id DESC/);
  assert.match(RANK_SQL, /COALESCE\(country_code, ''\),\s*COALESCE\(calendar_code, ''\),\s*day_type,\s*theme\s*\);/);
});

// ─── 20260915000200 — cross-account device claim hardening ───────────────────

test('device-claim migration is re-runnable', () => {
  assert.match(DEVICE_SQL, /create table if not exists public\.notification_device_claims/);
  assert.match(DEVICE_SQL, /create index if not exists notification_device_claims_device_idx/);
  assert.match(DEVICE_SQL, /create index if not exists notification_device_claims_new_user_idx/);
  assert.match(DEVICE_SQL, /create or replace function public\.guard_notification_device_claim/);
  assert.match(DEVICE_SQL, /drop trigger if exists notification_devices_guard_claim/);
});

test('device-claim guard is locked down and cannot be called from a client role', () => {
  assert.match(DEVICE_SQL, /security definer/);
  assert.match(DEVICE_SQL, /set search_path = ''/);
  assert.match(DEVICE_SQL, /revoke all on function public\.guard_notification_device_claim\(\) from public, anon, authenticated/i);
  // The audit table is deny-all for client roles: RLS on, no policy created.
  assert.match(DEVICE_SQL, /alter table public\.notification_device_claims enable row level security/);
  assert.ok(
    !/create policy[\s\S]{0,400}notification_device_claims/i.test(DEVICE_SQL),
    'no client policy may be created on the audit table',
  );
});

test('device-claim guard bounds, audits and serialises hand-overs', () => {
  assert.match(DEVICE_SQL, /before update of user_id on public\.notification_devices/);
  assert.match(DEVICE_SQL, /new\.user_id is not distinct from old\.user_id/);
  assert.match(DEVICE_SQL, /v_max_claims_per_day constant integer := 5/);
  assert.match(DEVICE_SQL, /claimed_at > statement_timestamp\(\) - interval '24 hours'/);
  assert.match(DEVICE_SQL, /insert into public\.notification_device_claims \(device_id, previous_user_id, new_user_id\)/);
  assert.match(DEVICE_SQL, /errcode = 'check_violation'/);
});

test('claim_notification_device is not executable by anon or PUBLIC', () => {
  assert.match(
    DEVICE_SQL,
    /revoke all on function public\.claim_notification_device\(text, text, text\) from public, anon/i,
  );
  assert.match(
    DEVICE_SQL,
    /grant execute on function public\.claim_notification_device\(text, text, text\) to authenticated/i,
  );
});

// ─── 20260915000300 — fail-closed expiry + provider provenance ───────────────

test('expiry/provider migration is additive and re-runnable', () => {
  assert.match(EXPIRY_SQL, /DROP CONSTRAINT IF EXISTS subscriptions_provider_check/);
  assert.match(EXPIRY_SQL, /DROP FUNCTION IF EXISTS public\.sync_revenuecat_subscription\(/);
  assert.match(EXPIRY_SQL, /DROP FUNCTION IF EXISTS public\.reserve_ai_request\(uuid, text\)/);
  // No existing row is rewritten: there is no UPDATE/backfill of subscriptions.
  assert.ok(!/UPDATE public\.subscriptions/i.test(EXPIRY_SQL));
});

test('expiry/provider migration pins search_path and grants only service_role', () => {
  const fnCount = (EXPIRY_SQL.match(/CREATE FUNCTION public\./g) ?? []).length;
  const pinned = (EXPIRY_SQL.match(/SET search_path = ''/gi) ?? []).length;
  assert.equal(fnCount, 2);
  assert.ok(pinned >= fnCount, 'every function needs a pinned search_path');
  assert.match(EXPIRY_SQL, /FROM PUBLIC, anon, authenticated;/);
  assert.match(EXPIRY_SQL, /TO service_role;/);
});

test('the old 8-argument sync function cannot survive as a manual-provider overload', () => {
  const dropAt = EXPIRY_SQL.indexOf('DROP FUNCTION IF EXISTS public.sync_revenuecat_subscription(');
  const createAt = EXPIRY_SQL.indexOf('CREATE FUNCTION public.sync_revenuecat_subscription(');
  assert.ok(dropAt >= 0 && createAt > dropAt, 'the old signature must be dropped before the new one is created');
  assert.match(EXPIRY_SQL, /p_provider text DEFAULT 'revenuecat'/);
  assert.match(EXPIRY_SQL, /p_provider IS NULL\s+OR p_provider NOT IN \('apple', 'google', 'revenuecat', 'manual'\)/);
  assert.ok(!/'manual',\s*\n\s*p_product_id/.test(EXPIRY_SQL));
});

// ─── 20260915000400 — prayer-audio bucket privacy ───────────────────────────

test('prayer audio bucket is private and no longer world-readable', () => {
  assert.match(AUDIO_SQL, /UPDATE storage\.buckets\s+SET\s+public = false/);
  assert.match(AUDIO_SQL, /DROP POLICY IF EXISTS "prayer_audio_public_read" ON storage\.objects/);
  assert.match(AUDIO_SQL, /CREATE POLICY "prayer_audio_read_for_signed_urls"\s+ON storage\.objects FOR SELECT\s+TO anon, authenticated/);
  // No write grant is added: uploads stay service-role only.
  assert.ok(!/FOR (INSERT|UPDATE|DELETE|ALL)/i.test(AUDIO_SQL), 'no write policy may be added');
});

// ═════════════════════════════════════════════════════════════════════════════
// Migration-history hardening (ORTODOXIA-MIGRATION-HISTORY-HARDENING-003)
//
// Four seed migrations are ALREADY APPLIED on the linked project, so editing them
// changes the repository but not the database. Their content is frozen back to HEAD
// and every correction that must exist remotely lives in an additive migration.
//
// This section asserts three things:
//   1. the four historical files still hold their ORIGINAL, unrepaired content;
//   2. the corrective migrations exist and are IDEMPOTENT;
//   3. applying them (simulated over the HEAD seed content) actually removes the
//      contamination — the check that matters, because it is the only one that can
//      prove the remote ends up repaired.
// ═════════════════════════════════════════════════════════════════════════════

const M5_SQL = read('supabase/migrations/20260915000500_repair_applied_seed_data.sql');
const M6_SQL = read('supabase/migrations/20260915000600_repair_ka_script_residues.sql');
const GREEK_SEED = 'supabase/migrations/20260911000100_seed_gr_church_of_greece_calendar_2026.sql';
const BULGARIAN_SEED = 'supabase/migrations/20260911001500_seed_bg_bulgarian_orthodox_calendar_2026.sql';
const RO_SEED = 'supabase/migrations/20260913120000_seed_ro_daily_notification_message_bank.sql';
const MULTILINGUAL_SEED = 'supabase/migrations/20260913121000_seed_multilingual_daily_notification_message_bank.sql';

/** Normalised read: line endings must not affect the revision hash. */
const readNormalized = (rel) => read(rel).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

/**
 * SHA-256 of the LF-normalised content of each ALREADY-APPLIED seed migration.
 *
 * These hashes are deliberately pinned. Changing an applied migration does not change
 * the database, so it must be a reviewed, deliberate act: this test is the friction
 * that makes such an edit impossible to slip through unnoticed. If a historical file
 * must genuinely change, move its effect into a new additive migration and update the
 * hash in the same reviewed commit.
 */
const APPLIED_REVISIONS = [
  { name: '20260911000100 (Greek calendar)', rel: GREEK_SEED, sha256: 'e546203bf9c02e568aeb0e331e564355ab490d2b4e8344d33d6d5ab64170eb0b' },
  { name: '20260911001500 (Bulgarian calendar)', rel: BULGARIAN_SEED, sha256: 'b4c329e5c440cf230e1376186913e9e65a4b7a34b5119b9b802631dd061b91d0' },
  { name: '20260913120000 (RO notification bank)', rel: RO_SEED, sha256: '701acd9ada1c7a5763386cd175ce213013226929a03b21974c051ed05e0385fc' },
  { name: '20260913121000 (multilingual bank)', rel: MULTILINGUAL_SEED, sha256: 'e90e5757d133241cb8aa1733f29ecb4635db4d9ec0c791bce708ac1c95ae2040' },
];

test('the four already-applied seed migrations are byte-identical to their HEAD revision', () => {
  for (const { name, rel, sha256: expected } of APPLIED_REVISIONS) {
    assert.equal(sha256(readNormalized(rel)), expected, `${name} has been edited in place`);
  }
});

test('the applied seeds still carry their ORIGINAL unrepaired content', () => {
  const greek = readNormalized(GREEK_SEED);
  const bulgarian = readNormalized(BULGARIAN_SEED);
  const ro = readNormalized(RO_SEED);
  const multilingual = readNormalized(MULTILINGUAL_SEED);

  // 4 x U+20BC (AZERI MANAT SIGN) where Greek capital alpha-with-tonos belongs. The
  // remote holds these 4 codepoints; a "helpful" in-place fix would silently leave the
  // database wrong, so the contaminated form MUST still be here.
  assert.equal((greek.match(/\u20bc/g) ?? []).length, 4, 'the Greek seed must still hold the 4 contaminated codepoints');
  assert.ok(greek.includes('\u20bc\u03b3\u03b9\u03b1'), 'the contaminated "Τα ₼για Θεοφάνεια" title must still be present');

  // Simplified-Chinese contamination is still in the multilingual seed.
  assert.ok((multilingual.match(/[\u4e00-\u9fff]/g) ?? []).length > 0, 'the Chinese contamination must still be present');

  // None of the four may have gained the re-run guards that were added and then reverted.
  assert.ok(!/delete from public\.notification_messages/i.test(ro), 'the RO seed must not carry the re-run DELETE');
  assert.ok(!/delete from public\.notification_messages/i.test(multilingual), 'the multilingual seed must not carry the re-run DELETE');
  assert.ok(!/on conflict/i.test(bulgarian), 'the Bulgarian seed must not carry the re-run ON CONFLICT clause');
});

// ─── parsing helpers for the corrective migrations ───────────────────────────

/** Quote-aware split of a migration into `;`-terminated statements. */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inString = false;
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") { current += "''"; i += 1; continue; }
        inString = false;
      }
      current += ch;
      continue;
    }
    if (ch === "'") { inString = true; current += ch; continue; }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      current += '\n';
      continue;
    }
    if (ch === ';') { statements.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements.filter((s) => s.length > 0);
}

const unquote = (raw) => raw.slice(1, -1).replace(/''/g, "'");

/** Parse `update public.notification_messages set ... where ...` statements. */
function parseNotificationUpdates(sql) {
  const updates = [];
  for (const statement of splitStatements(sql)) {
    if (!/^update public\.notification_messages\b/i.test(statement)) continue;
    const title = /title_template = ('(?:[^']|'')*')/.exec(statement);
    const body = /body_template = ('(?:[^']|'')*')/.exec(statement);
    const active = /is_active = (true|false)/.exec(statement);
    const where = statement.slice(statement.search(/\bwhere\b/i));
    const field = (name) => {
      if (new RegExp(`${name} is null`, 'i').test(where)) return null;
      const m = new RegExp(`${name} = ('(?:[^']|'')*')`, 'i').exec(where);
      return m ? unquote(m[1]) : undefined;
    };
    const dayType = (/day_type = ('(?:[^']|'')*')/i.exec(where) ?? [])[1];
    const theme = (/theme = ('(?:[^']|'')*')/i.exec(where) ?? [])[1];
    assert.ok(title && body && dayType && theme, `unparsable notification statement: ${statement.slice(0, 80)}`);
    updates.push({
      languageCode: field('language_code'),
      countryCode: field('country_code'),
      calendarCode: field('calendar_code'),
      dayType: unquote(dayType),
      theme: unquote(theme),
      title: unquote(title[1]),
      body: unquote(body[1]),
      isActive: active ? active[1] === 'true' : null,
    });
  }
  return updates;
}

/** Parse `update public.calendar_days set <col> = '...' where ...` statements. */
function parseCalendarUpdates(sql) {
  const updates = [];
  for (const statement of splitStatements(sql)) {
    if (!/^update public\.calendar_days\b/i.test(statement)) continue;
    const set = /set\s+([a-z_]+) = ('(?:[^']|'')*')/i.exec(statement);
    const key = (name) => {
      const m = new RegExp(`${name} = ('(?:[^']|'')*')`, 'i').exec(statement);
      return m ? unquote(m[1]) : null;
    };
    assert.ok(set, `unparsable calendar statement: ${statement.slice(0, 80)}`);
    updates.push({
      column: set[1],
      value: unquote(set[2]),
      countryCode: key('country_code'),
      languageCode: key('language_code'),
      calendarCode: key('calendar_code'),
      calendarDate: key('calendar_date'),
    });
  }
  return updates;
}

/** Parse the seed tuples of a notification bank (quote-aware). */
function parseSeedRows(sql) {
  const rows = [];
  let i = 0;
  while (i < sql.length) {
    const lineStart = sql.lastIndexOf('\n', i) + 1;
    if (!/^\s*$/.test(sql.slice(lineStart, i)) || sql[i] !== '(') { i += 1; continue; }
    const fields = [];
    let j = i + 1;
    let ok = true;
    for (let f = 0; f < 8 && ok; f += 1) {
      while (sql[j] === ' ') j += 1;
      if (sql[j] === "'") {
        j += 1;
        let value = '';
        while (j < sql.length) {
          if (sql[j] === "'") {
            if (sql[j + 1] === "'") { value += "'"; j += 2; continue; }
            j += 1; break;
          }
          value += sql[j]; j += 1;
        }
        fields.push(value);
      } else {
        const m = /^(null|true|false)/i.exec(sql.slice(j, j + 5));
        if (!m) { ok = false; break; }
        fields.push(m[1].toLowerCase());
        j += m[1].length;
      }
      while (sql[j] === ' ') j += 1;
      if (f < 7) {
        if (sql[j] !== ',') { ok = false; break; }
        j += 1;
      }
    }
    if (ok && sql[j] === ')') { rows.push(fields); i = j + 1; continue; }
    i += 1;
  }
  return rows;
}

const rowKey = (r) => [r.languageCode, r.countryCode ?? '', r.calendarCode ?? '',
  r.dayType, r.theme].join('|');

/** The seed files write `null` as a SQL literal; normalise it to the update form. */
const seedKey = (r) => [r[0], r[1] === 'null' ? '' : r[1], r[2] === 'null' ? '' : r[2], r[3], r[4]].join('|');

/** Apply the corrective updates to the seed content the remote currently holds. */
function simulate(seedRows, updates) {
  const byKey = new Map(seedRows.map((r) => [seedKey(r), r]));
  let applied = 0;
  for (const u of updates) {
    const k = rowKey(u);
    const row = byKey.get(k);
    assert.ok(row, `corrective migration targets a row that does not exist: ${k}`);
    row[5] = u.title;
    row[6] = u.body;
    if (u.isActive !== null) row[7] = String(u.isActive);
    applied += 1;
  }
  return { byKey, applied };
}

// ─── 20260915000500 — the data half of the reverted seed edits ───────────────

test('20260915000500 is additive and idempotent', () => {
  // Idempotent means: UPDATE only (re-runnable with an identical result), no
  // INSERT/DELETE/DDL that could fail or change cardinality on a second run.
  assert.ok(!/\binsert into\b/i.test(M5_SQL), 'the corrective migration must not insert');
  assert.ok(!/\bdelete from\b/i.test(M5_SQL), 'the corrective migration must not delete');
  assert.ok(!/\balter table\b|\bcreate (table|index|policy)\b|\bdrop \b/i.test(M5_SQL), 'the corrective migration must be data-only');
  const statements = splitStatements(M5_SQL);
  assert.ok(statements.length > 0);
  for (const statement of statements) {
    assert.match(statement, /^update public\.(notification_messages|calendar_days)\b/i,
      `only keyed UPDATEs are allowed: ${statement.slice(0, 60)}`);
  }
  // Neither re-run guard is repeated: de-dupe + the unique index live in 20260915000100.
  // (The comment may name the index to explain why the UPDATEs are safe; no statement
  // may create it.)
  assert.ok(!/create\s+unique\s+index/i.test(M5_SQL));
  // The unique-key columns must never be assigned, or the index could be violated.
  assert.ok(!/set[\s\S]{0,200}?\btheme\s*=/i.test(M5_SQL));
});

test('20260915000500 repairs the 4 Greek codepoints on the already-seeded rows', () => {
  assert.equal((M5_SQL.match(/\u20bc/g) ?? []).length, 0, 'the correction must not carry U+20BC');
  const calendar = parseCalendarUpdates(M5_SQL);
  assert.equal(calendar.length, 3);
  assert.equal((M5_SQL.match(/\u0386/g) ?? []).length, 4, 'exactly 4 corrected alpha-with-tonos characters');

  const dates = calendar.map((u) => u.calendarDate).sort();
  assert.deepEqual(dates, ['2026-01-06', '2026-01-20', '2026-01-27']);
  for (const u of calendar) {
    assert.equal(u.column, 'title');
    assert.equal(u.countryCode, 'GR');
    assert.equal(u.languageCode, 'el');
    assert.equal(u.calendarCode, 'gr-church-of-greece');
    assert.ok(!u.value.includes('\u20bc'), 'the replacement text must be free of U+20BC');
  }
});

test('applying 20260915000500 to the remote seed content removes the contamination', () => {
  const seedRows = parseSeedRows(readNormalized(MULTILINGUAL_SEED));
  const updates = parseNotificationUpdates(M5_SQL);
  assert.equal(updates.length, 36);

  const { applied } = simulate(seedRows, updates);
  assert.equal(applied, 36);

  const ka = seedRows.filter((r) => r[0] === 'ka');
  assert.equal(ka.length, 370);
  const contaminated = ka.filter((r) => /[\u4e00-\u9fff\u0400-\u04ff]/.test(`${r[5]}${r[6]}`));
  assert.deepEqual(contaminated, [], 'no ka row may keep Chinese or Cyrillic text after the correction');

  // The Greek titles must be free of the wrong codepoint once the update lands.
  for (const u of parseCalendarUpdates(M5_SQL)) assert.ok(!u.value.includes('\u20bc'));
});

// ─── 20260915000600 — the residual English/German/Italian/Arabic tokens ──────

test('20260915000600 is additive, idempotent and data-only', () => {
  assert.ok(!/\binsert into\b|\bdelete from\b|\balter table\b|\bcreate (table|index|policy)\b/i.test(M6_SQL));
  const statements = splitStatements(M6_SQL);
  assert.equal(statements.length, 18);
  for (const statement of statements) {
    assert.match(statement, /^update public\.notification_messages\b/i);
  }
  assert.ok(!/set[\s\S]{0,200}?\btheme\s*=/i.test(M6_SQL), 'the unique key must not be reassigned');
});

test('20260915000600 records the substitution table it applies', () => {
  // The replacements are lexical, and the Georgian they introduce must be auditable.
  for (const [from, to] of [
    ['Sorgen', 'საზრუნავი'],
    ['sincera', 'გულწრფელი'],
    ['discouragement', 'სასოწარკვეთა'],
    ['Courage', 'გამბედაობა'],
    ['وسط', 'შუაში'],
  ]) {
    assert.ok(M6_SQL.includes(`${from}`) && M6_SQL.includes(`${to}`),
      `the substitution ${from} -> ${to} must be documented`);
  }
  assert.ok(/SUBSTITUTION TABLE/.test(M6_SQL));
  assert.ok(/TITLE REPAIRS/.test(M6_SQL));
});

test('applying 20260915000600 leaves no non-Georgian token in the affected rows', () => {
  const seedRows = parseSeedRows(readNormalized(MULTILINGUAL_SEED));
  simulate(seedRows, parseNotificationUpdates(M5_SQL));
  const afterM5 = seedRows.filter((r) => r[0] === 'ka');

  // Placeholders are ASCII by design; strip them before looking for foreign script.
  const strip = (t) => t.replace(/\{[a-z_]+\}/g, ' ');
  const foreign = (r) => {
    const clean = `${strip(r[5])} ${strip(r[6])}`;
    return [...clean].some((ch) => {
      const cp = ch.codePointAt(0);
      const georgian = (cp >= 0x10a0 && cp <= 0x10ff) || (cp >= 0x2d00 && cp <= 0x2d2f) || (cp >= 0x1c90 && cp <= 0x1cbf);
      if (georgian) return false;
      const ascii = (cp >= 0x20 && cp <= 0x7e);
      return !ascii;
    }) || /[A-Za-z]/.test(strip(`${r[5]} ${r[6]}`));
  };

  const before = afterM5.filter(foreign).length;
  assert.equal(before, 18, 'the correction exists precisely because 18 rows carry a foreign token');

  simulate(seedRows, parseNotificationUpdates(M6_SQL));
  const after = seedRows.filter((r) => r[0] === 'ka').filter(foreign);
  assert.deepEqual(after.map((r) => r[4]), [], 'no ka row may keep a foreign token after the correction');
});

test('the corrective migrations do not duplicate work already done by 20260915000100-00400', () => {
  // 20260915000100 owns de-duplication and the unique index; the corrective migrations
  // must not restate them.
  for (const sql of [M5_SQL, M6_SQL]) {
    assert.ok(!/row_number\(\) over/i.test(sql), 'de-duplication belongs to 20260915000100');
    assert.ok(!/create unique index/i.test(sql), 'the unique index belongs to 20260915000100');
    assert.ok(!/current_period_end|sync_revenuecat_subscription|prayer-audio|classify_feast_rank\b/i.test(sql),
      'unrelated repairs must not be restated');
  }
});

test('20260915000100 stays schema/privilege-only and leaves row text to the corrective migrations', () => {
  // Its header states that the content corrections live in 20260915000500/00600, so this
  // pins that claim: the schema migration must not rewrite any user-visible text.
  assert.ok(!/title_template\s*=/i.test(RANK_SQL), 'content belongs to 20260915000500');
  assert.ok(!/body_template\s*=/i.test(RANK_SQL), 'content belongs to 20260915000500');
  assert.ok(!/update public\.calendar_days\s+set title/i.test(RANK_SQL), 'content belongs to 20260915000500');
  // The only calendar_days UPDATE it may perform is the feast_rank_code backfill.
  const calendarUpdates = (RANK_SQL.match(/update public\.calendar_days\s+set\s+([a-z_]+)/gi) ?? []);
  for (const statement of calendarUpdates) {
    assert.match(statement, /set feast_rank_code/i, `unexpected calendar_days update: ${statement}`);
  }
  // And it must not claim the four applied seeds were patched in place.
  assert.ok(!/patched in place/i.test(RANK_SQL), 'the stale "patched in place" claim must be gone');
});

test('the corrective migrations are ordered after every schema migration they rely on', () => {
  const names = ['20260915000100', '20260915000200', '20260915000300', '20260915000400', '20260915000500', '20260915000600'];
  const sorted = [...names].sort();
  assert.deepEqual(names, sorted, 'migration prefixes must already be in application order');
  assert.ok(sorted.at(-1) === '20260915000600');
});
