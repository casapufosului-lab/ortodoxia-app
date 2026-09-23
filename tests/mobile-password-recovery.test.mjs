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

test('native recovery helper consumes implicit e-mail link tokens', () => {
  // The helper accepts every auth e-mail link type, not recovery alone: an e-mail
  // confirmation carries a valid session that must be consumed rather than ignored.
  assert.ok(helper.includes('SUPPORTED_LINK_TYPES'));
  assert.ok(helper.includes('isSupportedLinkType(linkType)'));
  assert.ok(helper.includes("['recovery', 'signup', 'magiclink', 'email_change', 'invite']"));
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
  // Recovery mode is entered only for a recovery link; a confirmation link signs the\n  // user in without forcing the reset form.\n  assert.ok(provider.includes("setIsPasswordRecovery(result.linkType === 'recovery')"));
  assert.ok(provider.includes("event === 'SIGNED_OUT' ? false : current"));
});

test('native flow is manual while web URL session detection remains web-only', () => {
  assert.ok(supabaseClient.includes("detectSessionInUrl: Platform.OS === 'web'"));
});

test('existing password update flow remains connected to recovery mode', () => {
  assert.ok(authScreen.includes("activeMode === 'reset-password'"));
  assert.ok(authScreen.includes('supabase.auth.updateUser({ password: resetPassword })'));
});

test('startup gate defers auth events until cold-start recovery is resolved', () => {
  assert.ok(provider.includes('const startupResolvedRef = useRef(false)'));
  assert.ok(provider.includes('const pendingAuthEventRef = useRef'));
  assert.ok(provider.includes('if (!startupResolvedRef.current) {'));
  assert.ok(provider.includes('pendingAuthEventRef.current = { event, session: nextSession };'));
  assert.ok(provider.includes('startupResolvedRef.current = true;'));
});

test('cold-start recovery wins over any queued ordinary auth event', () => {
  // A successful cold-start recovery must discard any auth event that arrived
  // while startup was still resolving, so an ordinary SIGNED_IN cannot overwrite
  // the recovery session.
  const recovery = provider.indexOf('applyRecoveryResult(recovery)');
  const clearPending = provider.indexOf('pendingAuthEventRef.current = null;', recovery);
  assert.ok(recovery >= 0, 'cold-start recovery must be applied through applyRecoveryResult');
  assert.ok(clearPending > recovery, 'the queued auth event must be cleared after recovery wins');

  // The helper sets recovery mode for status "ok" and does not touch session state
  // for the other outcomes.
  const helperStart = provider.indexOf('const applyRecoveryResult =');
  const helperEnd = provider.indexOf('const loadInitialSession', helperStart);
  const helperBlock = provider.slice(helperStart, helperEnd);
  assert.ok(helperBlock.includes("if (result.status === 'ok')"));
  assert.ok(helperBlock.includes("setIsPasswordRecovery(result.linkType === 'recovery')"));
  assert.ok(helperBlock.includes("if (result.status === 'error')"));
});

test('an unusable recovery deep link surfaces a specific error instead of failing silently', () => {
  // Regression guard for the audit finding: the token exchange used to discard its
  // error and return null, so an expired link was indistinguishable from "no link".
  assert.ok(helper.includes("status: 'error'"));
  assert.ok(helper.includes("reason: 'expired_or_invalid'"));
  assert.ok(helper.includes("reason: 'malformed_link'"));
  assert.ok(!/if \(error\) return null;/.test(helper), 'the setSession error must not be discarded');

  // The provider records it and the screen renders it.
  assert.ok(provider.includes('recoveryLinkError'));
  assert.ok(provider.includes('setRecoveryLinkError(result.reason)'));
  assert.ok(authScreen.includes('recoveryLinkError'));
  assert.ok(authScreen.includes("t('auth.errorResetExpired')"));
});
