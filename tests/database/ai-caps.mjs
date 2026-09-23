// Run only against a fresh in-memory PGlite engine. Never uses a server URL.
// Usage: node tests/database/ai-caps.mjs <absolute path to @electric-sql/pglite/dist/index.js>
//
// Proves the behaviour of 20260923000100_add_client_and_monthly_ai_caps.sql by EXECUTING it
// on a real PostgreSQL engine: the per-identity daily limit, the per-(device+IP) and per-IP
// free-tier brakes, the global monthly cap and its month rollover, the fail-closed paths
// (no client hash, no configured budget) and the SQL privileges.
//
// It is NOT a multi-session test: PGlite serializes statements, so the advisory locks and
// FOR UPDATE clauses are exercised but not raced.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
let checks = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); checks++; };
const migration = (name) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');

const chain = [
  '20260830000100_add_subscriptions',
  '20260831000100_add_guest_ai_usage',
  '20260903000100_harden_ai_usage',
  '20260907000100_fix_ai_request_reservation',
  '20260909000400_fix_chat_cooldown_contract',
  '20260915000300_fail_closed_expiry_and_provider_provenance',
  '20260923000100_add_client_and_monthly_ai_caps',
];

const guest = 'guest-1234567890123456';
const user = '11111111-1111-4111-8111-111111111111';
const premiumUser = '22222222-2222-4222-8222-222222222222';
const deviceA = 'a'.repeat(64); // shape of a real salted hash; the value itself is meaningless
const ipA = 'b'.repeat(64);
const deviceB = 'c'.repeat(64);
const ipB = 'd'.repeat(64);

try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';`);

  const initial = migration('20260829000100_initial_schema');
  await db.exec(initial.match(/create or replace function public\.set_updated_at\(\)[\s\S]*?\$\$;/i)[0]);
  await db.exec(initial.match(/create table public\.usage_daily \([\s\S]*?\);/i)[0]);
  for (const name of chain) await db.exec(migration(name));

  const reserve = async ({ u = null, g = null, client = deviceA, ip = ipA } = {}) =>
    (await db.query('SELECT * FROM public.reserve_ai_request($1::uuid, $2::text, $3::text, $4::text)', [u, g, client, ip])).rows[0];

  // Counters age past the 5-second cooldown without touching the daily totals.
  const age = async () => db.exec(
    "UPDATE public.usage_daily SET last_request_at = now() - interval '6 seconds';" +
    "UPDATE public.guest_usage_daily SET last_request_at = now() - interval '6 seconds';" +
    "UPDATE public.ai_client_usage_daily SET last_request_at = now() - interval '6 seconds';",
  );

  // ─── the existing contract still holds, with the two new counters reported ───
  check(await reserve({ g: guest }), {
    remaining_limit: 4, daily_limit: 5, success: true, denial_reason: null,
    retry_after_seconds: 0, client_limit: 20, monthly_remaining: 19999,
  });

  const cooldown = await reserve({ g: guest });
  check(cooldown.success, false);
  check(cooldown.denial_reason, 'cooldown');
  assert.ok(cooldown.retry_after_seconds >= 1 && cooldown.retry_after_seconds <= 5); checks++;

  for (let remaining = 3; remaining >= 0; remaining--) { await age(); check((await reserve({ g: guest })).remaining_limit, remaining); }
  await age();
  const exhausted = await reserve({ g: guest });
  check(exhausted.success, false);
  check(exhausted.denial_reason, 'daily_limit');
  check(exhausted.retry_after_seconds, 0);
  check((await db.query('SELECT ai_messages FROM public.guest_usage_daily')).rows[0].ai_messages, 5);

  // ─── A · per-(device+IP) brake ───
  check((await db.query("SELECT ai_messages FROM public.ai_client_usage_daily WHERE scope='device' AND client_hash=$1", [deviceA])).rows[0].ai_messages, 5);
  check((await db.query("SELECT ai_messages FROM public.ai_client_usage_daily WHERE scope='ip' AND client_hash=$1", [ipA])).rows[0].ai_messages, 5);
  // Bring the device counter to its cap without spending 20 real messages.
  await db.query("UPDATE public.ai_client_usage_daily SET ai_messages = 20 WHERE scope='device' AND client_hash=$1", [deviceA]);
  const clientBrake = await reserve({ g: 'guest-clientbrake00001' }); // fresh identity, same device+IP
  check(clientBrake.success, false);
  check(clientBrake.denial_reason, 'client_limit');
  check(clientBrake.remaining_limit, 0);
  check(clientBrake.retry_after_seconds, 0);
  // A refused reservation does not move any counter.
  check((await db.query("SELECT ai_messages FROM public.ai_client_usage_daily WHERE scope='device' AND client_hash=$1", [deviceA])).rows[0].ai_messages, 20);

  // ─── A · per-IP brake, with a rotated device identifier ───
  await db.exec(`UPDATE public.ai_client_usage_daily SET ai_messages = 0;`);
  await db.query("UPDATE public.ai_client_usage_daily SET ai_messages = 60 WHERE scope='ip'");
  const ipBrake = await reserve({ g: 'guest-ipbrake0000000001', client: deviceB });
  check(ipBrake.success, false);
  check(ipBrake.denial_reason, 'ip_limit');

  // ─── B · global monthly cap ───
  await db.exec(`UPDATE public.ai_client_usage_daily SET ai_messages = 0;
    UPDATE public.guest_usage_daily SET ai_messages = 0, last_request_at = NULL;
    UPDATE public.ai_usage_monthly SET ai_messages = 3, message_cap = 3;`);
  const monthly = await reserve({ g: 'guest-monthly000000001' });
  check(monthly.success, false);
  check(monthly.denial_reason, 'monthly_cap');
  check(monthly.remaining_limit, 0);
  check(monthly.monthly_remaining, 0);
  assert.ok(monthly.retry_after_seconds >= 1, 'the monthly denial says when to come back');
  checks++;

  // A paid identity is not stopped by the free brakes, but the monthly cap stops it too.
  await db.query('INSERT INTO auth.users(id) VALUES ($1), ($2)', [user, premiumUser]);
  await db.query(`INSERT INTO public.subscriptions(user_id,status,plan,provider,current_period_end)
    VALUES ($1,'active','monthly','manual',now() + interval '10 days')`, [premiumUser]);
  check((await reserve({ u: premiumUser })).denial_reason, 'monthly_cap');

  // ─── B · the month rolls over exactly once ───
  await db.exec(`UPDATE public.ai_usage_monthly SET period_start = (date_trunc('month', timezone('Europe/Bucharest', now())) - interval '1 month')::date, ai_messages = 3;
    UPDATE public.guest_usage_daily SET ai_messages = 0, last_request_at = NULL;
    UPDATE public.usage_daily SET ai_messages = 0, last_request_at = NULL;`);
  const afterRollover = await reserve({ g: 'guest-rollover00000001' });
  check(afterRollover.success, true);
  check(afterRollover.monthly_remaining, 2);
  check((await db.query('SELECT ai_messages FROM public.ai_usage_monthly')).rows[0].ai_messages, 1);
  check((await db.query("SELECT period_start = date_trunc('month', timezone('Europe/Bucharest', now()))::date AS current FROM public.ai_usage_monthly")).rows[0].current, true);

  // ─── A · paid identity is not blocked by the free brakes ───
  await db.exec(`UPDATE public.ai_client_usage_daily SET ai_messages = 100;
    UPDATE public.usage_daily SET last_request_at = NULL;`);
  const paid = await reserve({ u: premiumUser });
  check(paid.success, true);
  check(paid.daily_limit, 50);

  // ─── fail-closed paths ───
  for (const args of [[null, null], [user, guest], [null, 'invalid'], [null, guest, 'not-a-hash'], [null, guest, deviceA, 'ZZ']]) {
    await assert.rejects(() => db.query('SELECT * FROM public.reserve_ai_request($1::uuid, $2::text, $3::text, $4::text)', args));
    checks++;
  }
  await db.exec('DELETE FROM public.ai_usage_monthly');
  await assert.rejects(() => reserve({ g: guest }), 'a database with no configured monthly budget must refuse');
  checks++;
  await db.exec(`INSERT INTO public.ai_usage_monthly (scope, period_start, ai_messages, message_cap)
    VALUES ('global', date_trunc('month', timezone('Europe/Bucharest', now()))::date, 0, 20000)`);

  // ─── operator controls ───
  check((await db.query('SELECT * FROM public.set_ai_monthly_cap($1)', [5000])).rows[0].message_cap, 5000);
  check((await db.query('SELECT message_cap FROM public.ai_monthly_status()')).rows[0].message_cap, 5000);
  for (const bad of [0, -1, 100000001, null]) {
    await assert.rejects(() => db.query('SELECT * FROM public.set_ai_monthly_cap($1)', [bad]));
    checks++;
  }

  // ─── privileges ───
  for (const role of ['anon', 'authenticated']) {
    check((await db.query("SELECT has_function_privilege($1, 'public.reserve_ai_request(uuid,text,text,text)', 'EXECUTE') AS allowed", [role])).rows[0].allowed, false);
    check((await db.query("SELECT has_function_privilege($1, 'public.set_ai_monthly_cap(integer)', 'EXECUTE') AS allowed", [role])).rows[0].allowed, false);
    check((await db.query("SELECT has_function_privilege($1, 'public.ai_monthly_status()', 'EXECUTE') AS allowed", [role])).rows[0].allowed, false);
  }
  check((await db.query("SELECT has_function_privilege('service_role', 'public.reserve_ai_request(uuid,text,text,text)', 'EXECUTE') AS allowed")).rows[0].allowed, true);
  check((await db.query("SELECT to_regprocedure('public.reserve_ai_request(uuid,text)') IS NULL AS removed")).rows[0].removed, true);
  await db.exec('SET ROLE anon');
  await assert.rejects(() => reserve({ g: guest }));
  checks++;
  await db.exec('RESET ROLE');

  // ─── the new tables are not readable by clients ───
  for (const table of ['ai_client_usage_daily', 'ai_usage_monthly']) {
    check((await db.query('SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass', [`public.${table}`])).rows[0].relrowsecurity, true);
  }

  console.log(`PASS: ${checks} database assertions against executed migrations`);
} finally {
  await db.close();
}
