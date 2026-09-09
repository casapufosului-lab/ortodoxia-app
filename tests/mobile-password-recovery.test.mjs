import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const appConfig = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const authScreen = readFileSync(join(root, 'src/app/auth.tsx'), 'utf8');
const provider = readFileSync(join(root, 'src/providers/auth-provider.tsx'), 'utf8');
const helper = readFileSync(join(root, 'src/lib/native-password-recovery.ts'), 'utf8');
const supabaseClient = readFileSync(join(root, 'src/lib/supabase.ts'), 'utf8');

test('native password recovery deep link uses the registered app scheme', () => {
  assert.equal(appConfig.expo.scheme, 'ortodoxia');
  assert.ok(helper.includes("NATIVE_PASSWORD_RECOVERY_REDIRECT_URL = 'ortodoxia://auth'"));
  assert.ok(authScreen.includes(': NATIVE_PASSWORD_RECOVERY_REDIRECT_URL;'));
});

test('native recovery helper consumes implicit recovery tokens', () => {
  assert.ok(helper.includes("getUrlParam(url, 'type') !== 'recovery'"));
  assert.ok(helper.includes("getUrlParam(url, 'access_token')"));
  assert.ok(helper.includes("getUrlParam(url, 'refresh_token')"));
  assert.ok(helper.includes('supabase.auth.setSession({'));
});

test('native recovery handles both cold-start and runtime deep links', () => {
  assert.ok(helper.includes('Linking.getInitialURL()'));
  assert.ok(helper.includes("Linking.addEventListener('url'"));
  assert.ok(helper.includes('subscription.remove()'));
});

test('auth provider enters and preserves recovery mode until sign-out', () => {
  assert.ok(provider.includes('getInitialNativePasswordRecoverySession'));
  assert.ok(provider.includes('subscribeToNativePasswordRecovery'));
  assert.ok(provider.includes('setIsPasswordRecovery(true)'));
  assert.ok(provider.includes("event === 'SIGNED_OUT' ? false : current"));
});

test('native flow is manual while web URL session detection remains web-only', () => {
  assert.ok(supabaseClient.includes("detectSessionInUrl: Platform.OS === 'web'"));
});

test('existing password update flow remains connected to recovery mode', () => {
  assert.ok(authScreen.includes("activeMode === 'reset-password'"));
  assert.ok(authScreen.includes('supabase.auth.updateUser({ password: resetPassword })'));
});
