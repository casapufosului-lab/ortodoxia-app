import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkDeletionCoverage, runDeletion, scanUserOwnedTables } from '../scripts/lib/deletion-coverage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const fn = readFileSync(join(root, 'supabase/functions/delete-account/index.ts'), 'utf8');
const clientHelper = readFileSync(join(root, 'src/lib/account-deletion.ts'), 'utf8');
const account = readFileSync(join(root, 'src/app/(tabs)/account.tsx'), 'utf8');
const i18n = readFileSync(join(root, 'src/i18n/config.ts'), 'utf8');

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
  // C12: înainte se verifica TEXTUL funcției (`fn.includes('verse_favorites')`), care ar fi trecut și
  // dacă ștergerea exista doar într-un comentariu. Acum comportamentul e EXECUTAT cu un client fals,
  // iar lista tabelelor așteptate vine din migrații, nu din codul funcției.
  assert.ok(fn.includes('deleteOwnedData'), 'handlerul trebuie să apeleze secvența testabilă din core.ts');
});

test('C12: fiecare tabelă cu references auth.users e ștearsă explicit sau prin cascadă documentată', async () => {
  const result = await checkDeletionCoverage({ root });
  assert.deepEqual(result.missing, [], `tabele neacoperite: ${result.missing.join(', ')}`);
  assert.deepEqual(result.unknownExplicit, [], `ștergeri din tabele care nu aparțin utilizatorului`);
  assert.deepEqual(result.cascadesWithoutClause, [], 'fiecare tabelă deținută de utilizator are ON DELETE CASCADE');
  assert.ok(result.userOwnedTables.length >= 10, `lista migrațiilor pare incompletă: ${result.userOwnedTables.join(', ')}`);
});

test('C12: ordinea dependențelor — chat_messages înainte de chat_threads', async () => {
  const result = await checkDeletionCoverage({ root });
  assert.equal(result.orderViolation, null);
});

test('C11: un SELECT eșuat pe chat_threads e raportat, nu înghițit', async () => {
  const corePath = join(root, 'supabase/functions/delete-account/core.ts');
  const { outcome } = await runDeletion(corePath, { failOn: ['chat_threads.select'] });
  assert.ok(
    outcome.errors.some((entry) => entry.startsWith('chat_threads(list)')),
    `eroarea de listare trebuie să apară în errors: ${JSON.stringify(outcome)}`,
  );
});

test('orice eroare reală de ștergere oprește fluxul înainte de ștergerea contului', async () => {
  const corePath = join(root, 'supabase/functions/delete-account/core.ts');
  for (const table of ['notification_devices', 'notification_preferences', 'favorites', 'verse_favorites', 'usage_daily', 'profiles']) {
    const { outcome } = await runDeletion(corePath, { failOn: [`${table}.delete`] });
    assert.ok(outcome.errors.some((entry) => entry.startsWith(table)), `${table} nu oprește fluxul`);
  }
});

test('o tabelă inexistentă în baza live e raportată ca skipped, fără să blocheze ștergerea', async () => {
  const corePath = join(root, 'supabase/functions/delete-account/core.ts');
  const { outcome } = await runDeletion(corePath, { missingTables: ['verse_favorites', 'ai_reports'] });
  assert.equal(outcome.errors.length, 0, JSON.stringify(outcome.errors));
  assert.ok(outcome.skipped.some((entry) => entry.startsWith('verse_favorites')), JSON.stringify(outcome.skipped));
});

test('documentația listează exact tabelele șterse (nu poate rămâne în urmă)', async () => {
  const doc = readFileSync(join(root, 'docs/ACCOUNT_DELETION.md'), 'utf8');
  const owned = [...scanUserOwnedTables(join(root, 'supabase/migrations')).keys()];
  for (const table of owned) {
    assert.ok(doc.includes(`\`${table}\``), `docs/ACCOUNT_DELETION.md nu pomenește tabela ${table}`);
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

// ─── Localized error codes ────────────────────────────────────────────────────

test('client helper uses AccountDeletionError for known static cases', () => {
  assert.ok(clientHelper.includes('AccountDeletionError'));
  assert.ok(clientHelper.includes("'AUTH_REQUIRED'"));
  assert.ok(clientHelper.includes("'SERVICE_UNAVAILABLE'"));
  assert.ok(clientHelper.includes("'DELETE_FAILED'"));
});

test('client helper preserves dynamic backend error as plain Error', () => {
  assert.ok(clientHelper.includes('typeof body.error'));
  assert.ok(clientHelper.includes('throw new Error(body.error)'));
});

test('i18n config has exact Romanian text for account deletion errors', () => {
  assert.ok(i18n.includes("'account.deleteAuthRequired': 'Autentificare necesară. Conectează-te din nou.'"));
  assert.ok(i18n.includes("'account.deleteServiceUnavailable': 'Serviciul nu este configurat. Încearcă mai târziu.'"));
  assert.ok(i18n.includes("'account.deleteFailedFallback': 'Contul nu a putut fi șters. Încearcă din nou.'"));
});

test('account.tsx maps AccountDeletionError codes to i18n keys', () => {
  assert.ok(account.includes('AccountDeletionError'));
  assert.ok(account.includes("'account.deleteAuthRequired'"));
  assert.ok(account.includes("'account.deleteServiceUnavailable'"));
  assert.ok(account.includes("'account.deleteFailedFallback'"));
});

test('i18n config has notification channel name', () => {
  assert.ok(i18n.includes("'account.notificationChannelName': 'Mesajul zilei'"));
});

test('account.tsx passes notification channel name to registration', () => {
  assert.ok(account.includes("t('account.notificationChannelName')"));
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
  assert.ok(account.includes("t('account.deleteAccountTitle')"));
  assert.ok(account.includes("t('account.deleteConfirmTitle')"));
  assert.ok(i18n.includes("'account.deleteAccountTitle': 'Șterge contul?'"));
  assert.ok(i18n.includes("'account.deleteConfirmTitle': 'Ești sigur?'"));
});

test('account.tsx shows danger zone only for logged-in users', () => {
  assert.ok(account.includes('{user ?'));
  assert.ok(account.includes("t('account.dangerZoneTitle')"));
  assert.ok(i18n.includes("'account.dangerZoneTitle': 'Zona periculoasă'"));
});

test('account.tsx prevents double-submit', () => {
  assert.ok(account.includes('if (deleteBusy || isDeleteRef.current) return'));
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

// Verificarea „user-owned tables have ON DELETE CASCADE on auth.users" verifica o singură apariție în
// tot SQL-ul (putea trece cu o singură tabelă corectă). Acoperirea per tabelă e acum în testul C12 de
// mai sus (`result.cascadesWithoutClause`), calculată din migrații.

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
