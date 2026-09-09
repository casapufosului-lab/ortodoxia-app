import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migration = readFileSync(
  join(root, 'supabase/migrations/20260909000300_claim_notification_device.sql'),
  'utf8',
);
const account = readFileSync(join(root, 'src/app/(tabs)/account.tsx'), 'utf8');

test('MEDIUM #10 client claims notification device through RPC', () => {
  assert.ok(account.includes("supabase.rpc('claim_notification_device', {"));
  assert.ok(account.includes('p_expo_push_token: registration.token'));
  assert.ok(account.includes('p_platform: registration.platform'));
  assert.ok(account.includes('p_timezone: timezone'));
  assert.ok(!account.includes("supabase.from('notification_devices').upsert"));
});

test('MEDIUM #10 client does not send user_id to device claim RPC', () => {
  const start = account.indexOf("supabase.rpc('claim_notification_device', {");
  assert.ok(start >= 0);
  const end = account.indexOf('});', start);
  assert.ok(end > start);
  const claim = account.slice(start, end);
  assert.ok(!claim.includes('user_id'));
  assert.ok(!claim.includes('user.id'));
});

test('MEDIUM #10 RPC derives owner only from auth.uid()', () => {
  assert.match(migration, /v_user_id uuid := auth\.uid\(\)/);
  assert.ok(!migration.includes('p_user_id'));
  assert.match(migration, /authentication required/);
});

test('MEDIUM #10 RPC is SECURITY DEFINER with empty search_path', () => {
  assert.match(migration, /SECURITY DEFINER/i);
  assert.match(migration, /SET search_path = ''/i);
});

test('MEDIUM #10 RPC execution is authenticated-only', () => {
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.claim_notification_device\(text, text, text\)[\s\S]*FROM PUBLIC, anon, authenticated, service_role;/i,
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.claim_notification_device\(text, text, text\)[\s\S]*TO authenticated;/i,
  );
  assert.doesNotMatch(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.claim_notification_device\(text, text, text\)[\s\S]*TO service_role;/i,
  );
});

test('MEDIU #10 ownership change clears prior delivery history before reassignment', () => {
  const condition = migration.indexOf(
    'IF v_previous_user_id IS DISTINCT FROM v_user_id THEN',
  );
  const remove = migration.indexOf(
    'DELETE FROM public.notification_deliveries',
    condition,
  );
  const update = migration.indexOf(
    'UPDATE public.notification_devices',
    remove,
  );

  assert.ok(condition >= 0);
  assert.ok(remove > condition);
  assert.ok(update > remove);
  assert.ok(
    migration.slice(remove, update).includes(
      'WHERE device_id = v_device_id',
    ),
  );
});

test('MEDIUM #10 same-owner refresh does not clear delivery history', () => {
  const condition = migration.indexOf(
    'IF v_previous_user_id IS DISTINCT FROM v_user_id THEN',
  );
  const endIf = migration.indexOf('END IF;', condition);
  const remove = migration.indexOf(
    'DELETE FROM public.notification_deliveries',
    condition,
  );

  assert.ok(condition >= 0);
  assert.ok(remove > condition);
  assert.ok(endIf > remove);
});

test('MEDIU #10 claim serializes concurrent claims for the same push token', () => {
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /hashtextextended\(p_expo_push_token, 0\)/i);
  assert.match(
    migration,
    /WHERE d\.expo_push_token = p_expo_push_token[\s\S]*FOR UPDATE;/i,
  );
});

test('MEDIUM #10 existing device is reassigned and reactivated atomically', () => {
  assert.match(migration, /user_id = v_user_id/);
  assert.match(migration, /platform = p_platform/);
  assert.match(migration, /timezone = p_timezone/);
  assert.match(migration, /is_active = true/);
  assert.match(migration, /WHERE id = v_device_id/);
});

test('MEDIUM #10 new token creates a device owned by auth.uid()', () => {
  assert.match(
    migration,
    /INSERT INTO public\.notification_devices[\s\S]*VALUES \([\s\S]*v_user_id,[\s\S]*p_expo_push_token/i,
  );
  assert.match(migration, /RETURNING id INTO v_device_id/);
});
