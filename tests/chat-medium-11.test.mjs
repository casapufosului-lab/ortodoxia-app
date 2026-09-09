import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'supabase/migrations/20260909000400_fix_chat_cooldown_contract.sql'),
  'utf8',
);
const client = readFileSync(join(root, 'src/app/(tabs)/chat.tsx'), 'utf8');
const backend = readFileSync(
  join(root, 'supabase/functions/orthodox-chat/index.ts'),
  'utf8',
);

test('MEDIUM #11 RPC exposes explicit denial reason and retry delay', () => {
  assert.match(
    migration,
    /RETURNS TABLE \([\s\S]*denial_reason text,[\s\S]*retry_after_seconds integer[\s\S]*\)/i,
  );
});

test('MEDIUM #11 migration uses valid PostgreSQL special-expression syntax', () => {
assert.ok(!migration.includes('pg_catalog.coalesce'));
assert.ok(!migration.includes('pg_catalog.extract'));
assert.match(migration, /COALESCE\(v_used, 0\)/);
assert.match(migration, /EXTRACT\(EPOCH FROM \(\(v_last_request_at \+ interval '5 seconds'\) - v_now\)\)/i);
});
test('MEDIUM #11 RPC serializes reservations for the same identity and date', () => {
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /hashtextextended\(v_lock_key, 0\)/i);
});

test('MEDIUM #11 daily limit is distinguished from cooldown', () => {
  const daily = migration.indexOf("IF v_used >= v_limit THEN");
  const cooldown = migration.indexOf("IF v_last_request_at IS NOT NULL");
  assert.ok(daily >= 0);
  assert.ok(cooldown > daily);
  assert.ok(
    migration
      .slice(daily, cooldown)
      .includes("false, 'daily_limit'::text, 0"),
  );
});

test('MEDIUM #11 cooldown preserves actual remaining quota', () => {
  assert.match(
    migration,
    /RETURN QUERY SELECT v_limit - v_used, v_limit, false, 'cooldown'::text, v_retry_after;/i,
  );
});

test('MEDIUM #11 reservation RPC remains service-role only', () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.reserve_ai_request\(uuid, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.reserve_ai_request\(uuid, text\)[\s\S]*TO service_role;/i,
  );
});

test('MEDIUM #11 client no longer treats every HTTP 429 as exhausted quota', () => {
  assert.ok(!client.includes("error.context.status === 429"));
  assert.ok(
    client.includes("if (details?.code === 'daily_limit') setRemaining(0);"),
  );
});

test('MEDIUM #11 client accepts server remaining value before daily-limit override', () => {
  const remaining = client.indexOf(
    "if (typeof details?.remaining === 'number') setRemaining(details.remaining);",
  );
  const daily = client.indexOf(
    "if (details?.code === 'daily_limit') setRemaining(0);",
  );
  assert.ok(remaining >= 0);
  assert.ok(daily > remaining);
});

test('MEDIUM #11 backend returns structured cooldown response', () => {
  assert.ok(backend.includes("code: 'cooldown'"));
  assert.ok(backend.includes('remaining: reservation.remaining_limit'));
  assert.ok(backend.includes('retryAfter,'));
});

test('MEDIUM #11 backend returns structured daily-limit response', () => {
  assert.ok(backend.includes("code: 'daily_limit'"));
  assert.ok(backend.includes('remaining: 0'));
  assert.ok(backend.includes('retryAfter: 0'));
});

test('MEDIUM #11 backend validates malformed denial contracts fail closed', () => {
  assert.ok(
    backend.includes(
      "(reservation.success && (denialReason !== null || retryAfter !== 0))",
    ),
  );
  assert.ok(backend.includes("(!reservation.success && denialReason === null)"));
  assert.ok(
    backend.includes(
      "(denialReason === 'daily_limit' && (reservation.remaining_limit !== 0 || retryAfter !== 0))",
    ),
  );
  assert.ok(
    backend.includes(
      "(denialReason === 'cooldown' && (reservation.remaining_limit <= 0 || retryAfter < 1))",
    ),
  );
});
