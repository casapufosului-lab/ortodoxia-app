/**
 * Per-device/IP and global monthly AI limits (20260923000100).
 *
 * Three things are checked here, each against the real artifact rather than a description:
 *   A. the migration's own guards (tables, constraints, fail-closed paths, privileges);
 *   B. the Edge Function and the migration agree on the shared constants and on the shapes;
 *   C. the client identifier is stable, persisted and accepted by the server's pattern.
 *
 * The SQL BEHAVIOUR (counters, brakes, month rollover, denials) is executed for real by
 * `node tests/database/ai-caps.mjs <pglite-dist>` — that runner needs an external database
 * engine, so it is not part of `npm test`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const migrationName = '20260923000100_add_client_and_monthly_ai_caps';
const migration = readFileSync(resolve(`supabase/migrations/${migrationName}.sql`), 'utf8');
const endpoint = readFileSync(resolve('supabase/functions/orthodox-chat/index.ts'), 'utf8');
const chatScreen = readFileSync(resolve('src/app/(tabs)/chat.tsx'), 'utf8');
const deviceLib = readFileSync(resolve('src/lib/ai-limit-device.ts'), 'utf8');
const docs = readFileSync(resolve('docs/AI_LIMITS_DEVICE_MONTHLY.md'), 'utf8');

// ─── A · the migration ────────────────────────────────────────────────────────

test('the migration adds both counters with their constraints', () => {
  assert.match(migration, /CREATE TABLE public\.ai_client_usage_daily/);
  assert.match(migration, /CHECK \(scope IN \('device', 'ip'\)\)/);
  assert.match(migration, /client_hash text NOT NULL CHECK \(client_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(migration, /PRIMARY KEY \(scope, client_hash, usage_date\)/);
  assert.match(migration, /CREATE TABLE public\.ai_usage_monthly/);
  assert.match(migration, /message_cap integer NOT NULL CHECK \(message_cap > 0\)/);
  assert.match(migration, /scope text PRIMARY KEY CHECK \(scope = 'global'\)/);
  for (const table of ['ai_client_usage_daily', 'ai_usage_monthly']) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  }
});

test('the monthly budget is seeded for the current Bucharest month', () => {
  assert.match(
    migration,
    /INSERT INTO public\.ai_usage_monthly \(scope, period_start, ai_messages, message_cap\)\s*\n\s*VALUES \('global', date_trunc\('month', timezone\('Europe\/Bucharest', now\(\)\)\)::date, 0, \d+\)/,
  );
  assert.match(migration, /ON CONFLICT \(scope\) DO NOTHING/);
});

test('the 2-argument reservation RPC cannot survive', () => {
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.reserve_ai_request\(uuid, text\);/);
  assert.match(migration, /CREATE FUNCTION public\.reserve_ai_request\(\s*\n\s*p_user_id uuid,\s*\n\s*p_guest_id text,\s*\n\s*p_client_hash text,\s*\n\s*p_ip_hash text\s*\n\)/);
  assert.equal(
    (migration.match(/public\.reserve_ai_request/gu) ?? []).length >= 5,
    true,
    'every grant, revoke and comment must name the 4-argument signature',
  );
  assert.equal(migration.includes('reserve_ai_request(uuid, text)') && !migration.includes('DROP FUNCTION IF EXISTS public.reserve_ai_request(uuid, text);'), false);
});

test('a reservation without a server-computed hash is refused, not defaulted', () => {
  assert.match(migration, /IF p_client_hash IS NULL OR p_client_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /p_ip_hash IS NULL OR p_ip_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /RAISE EXCEPTION 'Invalid client identity hash'/);
  assert.equal(/p_client_hash text DEFAULT/u.test(migration), false, 'a defaulted hash would keep the old call shape working');
});

test('the monthly budget is a fail-closed brake, not an implicit unlimited', () => {
  assert.match(migration, /IF v_month_cap IS NULL THEN\s*\n\s*RAISE EXCEPTION 'AI monthly budget is not configured'/);
  assert.match(migration, /IF v_month_used >= v_month_cap THEN/);
  assert.match(migration, /'monthly_cap'::text/);
});

test('the global row is locked before the identity row, in one fixed order', () => {
  const monthlyLock = migration.indexOf("pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-monthly:global', 0))");
  const identityLock = migration.indexOf('pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0))');
  assert.ok(monthlyLock > 0 && identityLock > monthlyLock, 'the shared row is always locked first, so two reservations cannot deadlock');
  assert.match(migration, /FOR UPDATE;/);
});

test('all four counters move together on a successful reservation', () => {
  const inserts = [
    /INSERT INTO public\.usage_daily|INSERT INTO public\.guest_usage_daily/,
    /INSERT INTO public\.ai_client_usage_daily AS c \([\s\S]*?'device'/,
    /INSERT INTO public\.ai_client_usage_daily AS c \([\s\S]*?'ip'/,
    /UPDATE public\.ai_usage_monthly AS m\s*\n\s*SET ai_messages = m\.ai_messages \+ 1/,
  ];
  for (const pattern of inserts) assert.match(migration, pattern);
  // Every denial returns before the inserts, so a refused request cannot move a counter.
  const lastDenial = migration.lastIndexOf('RETURN;');
  const firstInsert = migration.indexOf('INSERT INTO public.usage_daily AS u (');
  assert.ok(firstInsert > lastDenial, 'the increments come after every denial path');
});

test('the free-tier brakes apply to free identities only', () => {
  assert.match(migration, /v_client_limit constant integer := \d+;/);
  assert.match(migration, /v_ip_limit constant integer := \d+;/);
  assert.match(migration, /IF v_limit <= 5 THEN\s*\n\s*IF v_client_used >= v_client_limit THEN/);
  assert.match(migration, /'client_limit'::text/);
  assert.match(migration, /'ip_limit'::text/);
});

test('the reservation RPC and the operator controls are service-role only', () => {
  for (const fn of ['reserve_ai_request(uuid, text, text, text)', 'set_ai_monthly_cap(integer)', 'ai_monthly_status()']) {
    assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn.replace(/[()]/gu, '\\$&')}\\s*\\n?FROM PUBLIC, anon, authenticated, service_role;`));
    assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn.replace(/[()]/gu, '\\$&')}\\s*\\n?TO service_role;`));
  }
  assert.match(migration, /IF p_cap IS NULL OR p_cap < 1 OR p_cap > 100000000 THEN\s*\n\s*RAISE EXCEPTION 'Invalid AI monthly cap'/);
});

test('no existing row is rewritten and no data is invented', () => {
  assert.equal(/DELETE FROM public\.(usage_daily|guest_usage_daily|subscriptions)/u.test(migration), false);
  assert.equal(/UPDATE public\.(usage_daily|guest_usage_daily) SET ai_messages = 0/u.test(migration), false);
  assert.match(migration, /LOCAL ONLY — NOT applied to any live database\./);
});

// ─── B · endpoint and migration agree ────────────────────────────────────────

test('the endpoint validates the same client limit the database enforces', () => {
  const endpointLimit = /const CLIENT_DAILY_LIMIT = (\d+);/u.exec(endpoint)?.[1];
  const sqlLimit = /v_client_limit constant integer := (\d+);/u.exec(migration)?.[1];
  assert.equal(endpointLimit, sqlLimit, 'a drift here would make every chat request fail with 500');
  assert.equal(endpointLimit, '20');
});

test('the endpoint hashes a salted (device + address) and the address alone', () => {
  assert.match(endpoint, /Deno\.env\.get\('AI_LIMIT_SALT'\) \?\? serviceRoleKey/);
  assert.match(endpoint, /sha256Hex\(`\$\{limitSalt\}\|device\|\$\{address\}\|\$\{deviceSignal\(req\)\}`\)/);
  assert.match(endpoint, /sha256Hex\(`\$\{limitSalt\}\|ip\|\$\{address\}`\)/);
  assert.match(endpoint, /globalThis\.crypto\.subtle\.digest\('SHA-256'/);
  assert.match(endpoint, /if \(limitSalt\.length === 0 \|\| typeof globalThis\.crypto\?\.subtle\?\.digest !== 'function'\)/);
  assert.match(endpoint, /return json\(\{ error: 'Chatul AI nu este configurat încă\.' \}, 503\)/);
  // No request field can override the two hashes, and no raw signal is sent to SQL.
  assert.match(endpoint, /p_client_hash: clientHash,\s*\n\s*p_ip_hash: ipHash,/);
  assert.equal(endpoint.includes('p_ip: '), false);
});

test('the endpoint accepts exactly the denial reasons the database can return', () => {
  const reasons = [...endpoint.matchAll(/'([a-z_]+)'/gu)].map(match => match[1]);
  for (const reason of ['cooldown', 'daily_limit', 'client_limit', 'ip_limit', 'monthly_cap']) {
    assert.ok(reasons.includes(reason), `${reason} must be handled`);
    assert.ok(migration.includes(`'${reason}'::text`), `${reason} must be produced by SQL`);
  }
  assert.match(endpoint, /const maxRetrySeconds = denialReason === 'monthly_cap' \? MAX_MONTHLY_RETRY_SECONDS : 5;/);
});

test('the app sends the device identifier with every chat request', () => {
  assert.match(chatScreen, /headers: \{ 'x-device-id': await getAiLimitDeviceId\(\) \}/);
  // Quota codes are localized on the client (tests/quota-messages-i18n.test.mjs); here we only pin the
  // badge behaviour: every exhausted-quota code clears the counter, the cooldown does not.
  assert.match(chatScreen, /if \(isQuotaExhausted\(details\?\.code\)\) setRemaining\(0\);/);
});

// ─── C · the client identifier ───────────────────────────────────────────────

const compiledLib = ts.transpileModule(deviceLib, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

/** A fresh module instance with stubbed native storage, so the memoised value is per case. */
function loadDeviceLib(options = {}) {
  const writes = [];
  const store = {
    getItemAsync: async (key) => {
      if (options.readThrows) throw new Error('keystore unavailable');
      return options.stored?.[key] ?? null;
    },
    setItemAsync: async (key, value) => {
      if (options.writeThrows) throw new Error('keystore unavailable');
      writes.push([key, value]);
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiledLib, {
    exports: module.exports,
    module,
    require: (name) => {
      if (name === 'expo-secure-store') return store;
      if (name === 'react-native') return { Platform: { OS: options.platform ?? 'ios' } };
      return {};
    },
    crypto: options.noCrypto ? undefined : globalThis.crypto,
    Math,
    console,
  });
  return { lib: module.exports, writes };
}

// The pattern the Edge Function accepts, taken from its own source so the two cannot drift.
const acceptedPattern = new RegExp(/\/\^\[a-z0-9\._-\]\{8,64\}\$\//u.exec(endpoint)[0].slice(1, -1), 'u');

test('the device identifier is created once, reused, and accepted by the server', async () => {
  const { lib, writes } = loadDeviceLib();
  const first = await lib.getAiLimitDeviceId();
  const second = await lib.getAiLimitDeviceId();
  assert.equal(first, second);
  assert.match(first, acceptedPattern);
  assert.deepEqual(writes, [['ortodoxia-ai-device-id', first]]);
  assert.equal(lib.getAiLimitDeviceId.length, 0);
});

test('a stored identifier is reused instead of rewritten', async () => {
  const stored = { 'ortodoxia-ai-device-id': 'aaaa1111-bbbb-2222-cccc-3333dddd4444' };
  const { lib, writes } = loadDeviceLib({ stored });
  assert.equal(await lib.getAiLimitDeviceId(), stored['ortodoxia-ai-device-id']);
  assert.deepEqual(writes, []);
});

test('a stored value the server would reject is replaced, not sent', async () => {
  const { lib, writes } = loadDeviceLib({ stored: { 'ortodoxia-ai-device-id': 'SHORT' } });
  const value = await lib.getAiLimitDeviceId();
  assert.notEqual(value, 'SHORT');
  assert.match(value, acceptedPattern);
  assert.equal(writes.length, 1);
});

test('storage failures never break the chat request', async () => {
  for (const options of [{ readThrows: true }, { writeThrows: true }]) {
    const { lib } = loadDeviceLib(options);
    const value = await lib.getAiLimitDeviceId();
    assert.match(value, acceptedPattern);
  }
  const { lib } = loadDeviceLib({ noCrypto: true });
  assert.match(await lib.getAiLimitDeviceId(), acceptedPattern, 'the fallback generator still produces an accepted value');
});

// ─── D · what the operator has to do is written down ─────────────────────────

test('the operator steps for the salt, the cap and the release order are documented', () => {
  for (const needle of ['AI_LIMIT_SALT', 'set_ai_monthly_cap', 'npm test', 'PGlite', '20260923000100', 'deploy']) {
    assert.ok(docs.includes(needle), `docs/AI_LIMITS_DEVICE_MONTHLY.md must mention ${needle}`);
  }
  assert.equal(/https?:\/\//u.test(docs.split('## ')[0]), false, 'no links in the summary block');
});
