// Run only against a fresh in-memory PGlite engine. Never uses a server URL.
// Usage: node tests/database/chat-quota.mjs <absolute path to @electric-sql/pglite/dist/index.js>
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const db = new PGlite();
let checks = 0;
const check = (value, expected) => { assert.deepEqual(value, expected); checks++; };
const migration = name => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
try {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT NULL::uuid';`);
  const initial = migration('20260829000100_initial_schema');
  await db.exec(initial.match(/create or replace function public\.set_updated_at\(\)[\s\S]*?\$\$;/i)[0]);
  await db.exec(initial.match(/create table public\.usage_daily \([\s\S]*?\);/i)[0]);
  for (const name of ['20260830000100_add_subscriptions', '20260831000100_add_guest_ai_usage', '20260903000100_harden_ai_usage', '20260907000100_fix_ai_request_reservation']) await db.exec(migration(name));
  const guest = 'guest-1234567890123456';
  const user = '11111111-1111-4111-8111-111111111111';
  const reserve = async (u = null, g = guest) => (await db.query('SELECT * FROM public.reserve_ai_request($1::uuid, $2::text)', [u, g])).rows[0];
  const age = async () => db.exec("UPDATE public.guest_usage_daily SET last_request_at = now() - interval '6 seconds'; UPDATE public.usage_daily SET last_request_at = now() - interval '6 seconds';");
  check(await reserve(), { remaining_limit: 4, daily_limit: 5, success: true });
  check((await reserve()).success, false);
  for (let remaining = 3; remaining >= 0; remaining--) { await age(); check((await reserve()).remaining_limit, remaining); }
  await age(); check((await reserve()).success, false);
  check((await db.query('SELECT ai_messages FROM public.guest_usage_daily')).rows[0].ai_messages, 5);
  check((await db.query("SELECT usage_date = timezone('Europe/Bucharest', now())::date AS correct FROM public.guest_usage_daily")).rows[0].correct, true);
  // Simultaneously submitted promises are serialized by PGlite: this is NOT a multi-session lock test.
  const burst = await Promise.all(Array.from({length: 20}, () => reserve(null, 'guest-burst12345678901')));
  check(burst.filter(r => r.success).length, 1);
  await db.query('INSERT INTO auth.users(id) VALUES ($1)', [user]);
  check((await reserve(user, null)).daily_limit, 5);
  for (const plan of ['monthly', 'annual']) {
    for (const status of ['active', 'trialing', 'canceled']) {
      await db.query(`INSERT INTO public.subscriptions(user_id,status,plan,provider,current_period_end)
        VALUES ($1,$2,$3,'manual',now() + interval '1 day') ON CONFLICT(user_id) DO UPDATE
        SET status=EXCLUDED.status,plan=EXCLUDED.plan,current_period_end=EXCLUDED.current_period_end`, [user,status,plan]);
      await age(); check((await reserve(user, null)).daily_limit, 50);
    }
  }
  await db.exec("UPDATE public.usage_daily SET ai_messages=49, last_request_at=now()-interval '6 seconds'");
  check(await reserve(user, null), { remaining_limit: 0, daily_limit: 50, success: true });
  await age(); check((await reserve(user, null)).success, false);
  for (const expired of ["status='expired'", "status='active',current_period_end=now()-interval '1 day'"]) {
    await db.exec(`UPDATE public.subscriptions SET ${expired}; UPDATE public.usage_daily SET ai_messages=0, last_request_at=NULL;`);
    check((await reserve(user, null)).daily_limit, 5);
  }
  for (const role of ['anon', 'authenticated']) {
    check((await db.query("SELECT has_function_privilege($1, 'public.reserve_ai_request(uuid,text)', 'EXECUTE') AS allowed", [role])).rows[0].allowed, false);
  }
  check((await db.query("SELECT has_function_privilege('service_role', 'public.reserve_ai_request(uuid,text)', 'EXECUTE') AS allowed")).rows[0].allowed, true);
  check((await db.query("SELECT to_regprocedure('public.increment_ai_usage(uuid,uuid,integer,integer)') IS NULL AS removed")).rows[0].removed, true);
  for (const args of [[null,null],[user,guest],[null,'invalid']]) { await assert.rejects(() => reserve(...args)); checks++; }
  await db.exec('SET ROLE anon'); await assert.rejects(() => reserve()); checks++; await db.exec('RESET ROLE');
  console.log(`PASS: ${checks} database assertions against executed migrations`);
} finally { await db.close(); }
