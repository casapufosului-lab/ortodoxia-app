import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const fn = readFileSync(join(root, 'supabase/functions/delete-account/index.ts'), 'utf8');
const clientHelper = readFileSync(join(root, 'src/lib/account-deletion.ts'), 'utf8');
const account = readFileSync(join(root, 'src/app/(tabs)/account.tsx'), 'utf8');

// ─── Edge Function security ─────────────────────────────────────────────────

test('Edge Function rejects non-POST methods', () => {
  assert.ok(fn.includes("if (req.method !== 'POST')"));
});

test('Edge Function requires Authorization header', () => {
  assert.ok(fn.includes("req.headers.get('Authorization')"));
  assert.ok(fn.includes('401'));
});

test('Edge Function derives user ID from verified JWT only', () => {
  assert.ok(fn.includes('auth.getUser'));
  assert.ok(fn.includes('userData.user.id'));
  assert.ok(!fn.includes('body.userId'));
  assert.ok(!fn.includes('body.user_id'));
  assert.ok(!fn.includes('body.target'));
});

test('Edge Function uses service-role for server-side deletions', () => {
  assert.ok(fn.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert.ok(fn.includes('admin = createClient'));
});

test('Edge Function deletes all user-owned tables explicitly', () => {
  for (const table of ['notification_devices', 'notification_preferences', 'chat_messages', 'chat_threads', 'favorites', 'usage_daily', 'profiles']) {
    assert.ok(fn.includes(`'${table}'`), `missing explicit delete for ${table}`);
  }
});

test('Edge Function deletes auth user as final step', () => {
  assert.ok(fn.includes('admin.auth.admin.deleteUser'));
  const deleteAuthIdx = fn.indexOf('deleteUser');
  const deleteProfileIdx = fn.indexOf("from('profiles')");
  assert.ok(deleteProfileIdx < deleteAuthIdx, 'profiles must be deleted before auth user');
});

test('Edge Function does NOT explicitly delete subscriptions', () => {
  assert.equal(fn.indexOf("from('subscriptions')"), -1);
});

test('Edge Function aborts on DB cleanup failure', () => {
  assert.ok(fn.includes('errors.length > 0'));
  assert.ok(fn.includes('500'));
});

test('Edge Function does not log secrets', () => {
  assert.ok(!fn.includes('console.log(serviceRoleKey)'));
  assert.ok(!fn.includes('console.log(token)'));
  assert.ok(!fn.includes('console.log(supabaseUrl)'));
});

test('Edge Function handles OPTIONS for CORS', () => {
  assert.ok(fn.includes("'OPTIONS'"));
});

// ─── Client helper ──────────────────────────────────────────────────────────

test('client helper calls delete-account Edge Function', () => {
  assert.ok(clientHelper.includes('delete-account'));
  assert.ok(clientHelper.includes("method: 'POST'"));
});

test('client helper uses session access_token', () => {
  assert.ok(clientHelper.includes('access_token'));
  assert.ok(clientHelper.includes('Bearer'));
});

test('client helper throws on failure', () => {
  assert.ok(clientHelper.includes('throw new Error'));
});

test('client helper does not send user ID in body', () => {
  assert.ok(!clientHelper.includes('userId'));
  assert.ok(!clientHelper.includes('user_id'));
});

// ─── Account UI ─────────────────────────────────────────────────────────────

test('account.tsx imports requestAccountDeletion', () => {
  assert.ok(account.includes("from '@/lib/account-deletion'"));
});

test('account.tsx has double confirmation flow', () => {
  assert.ok(account.includes('Șterge contul?'));
  assert.ok(account.includes('Ești sigur?'));
});

test('account.tsx shows danger zone only for logged-in users', () => {
  assert.ok(account.includes('{user ?'));
  assert.ok(account.includes('Zona periculoasă'));
});

test('account.tsx prevents double-submit', () => {
  assert.ok(account.includes('if (deleteBusy) return'));
  assert.ok(account.includes('disabled={deleteBusy}'));
});

test('account.tsx has loading and error states', () => {
  assert.ok(account.includes('deleteBusy'));
  assert.ok(account.includes('ActivityIndicator'));
  assert.ok(account.includes('deleteError'));
});

test('account.tsx navigates home after deletion', () => {
  assert.ok(account.includes("router.replace('/')"));
  assert.ok(account.includes('await signOut()'));
});

test('account.tsx uses danger styling', () => {
  assert.ok(account.includes('dangerButton'));
  assert.ok(account.includes('dangerButtonText'));
  assert.ok(account.includes('dangerCard'));
});

// ─── Schema checks ──────────────────────────────────────────────────────────

function scanSql(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = readdirSync(current); } catch { continue; }
    for (const name of entries) {
      const full = join(current, name);
      if (existsSync(full) && statSync(full)?.isDirectory()) stack.push(full);
      else if (name.endsWith('.sql')) out.push(full);
    }
  }
  return out;
}

const migrations = scanSql(join(root, 'supabase/migrations'));
const allSql = migrations.map((f) => readFileSync(f, 'utf8')).join('\n');

test('user-owned tables have ON DELETE CASCADE on auth.users', () => {
  assert.ok(allSql.includes("references auth.users(id) on delete cascade"));
});

test('account-deletion.ts has no subscription table access', () => {
  assert.ok(!clientHelper.includes("'subscriptions'"));
  assert.ok(!clientHelper.includes('"subscriptions"'));
});

test('Edge Function creates its own Supabase clients', () => {
  assert.ok(fn.includes("from 'npm:@supabase/supabase-js@2'"));
  assert.ok(!fn.includes("from '@/"));
});

test('docs/ACCOUNT_DELETION.md exists', () => {
  assert.ok(existsSync(join(root, 'docs/ACCOUNT_DELETION.md')));
});
