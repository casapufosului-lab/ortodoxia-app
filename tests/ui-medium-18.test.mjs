import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = readFileSync('src/app/auth.tsx', 'utf8');
const account = readFileSync('src/app/(tabs)/account.tsx', 'utf8');

test('MEDIUM #18 auth feedback has a web alert fallback', () => {
  assert.match(auth, /function showAuthAlert/);
  assert.match(auth, /Platform\.OS === 'web'/);
  assert.match(auth, /window\.alert/);
  // Assert that every call site resolves to the helper rather than hardcoding a
  // brittle call count, which broke on unrelated additions.
  const declared = (auth.match(/function showAuthAlert\(/g) ?? []).length;
  const called = (auth.match(/showAuthAlert\(/g) ?? []).length - declared;
  assert.ok(called >= 10, `expected the auth screen to route feedback through showAuthAlert, saw ${called} call(s)`);
  // Native feedback must go through the helper (which owns the web fallback), not
  // through a bare Alert.alert call at a call site.
  assert.equal((auth.match(/Alert\.alert\(/g) ?? []).length, 1, 'Alert.alert belongs inside showAuthAlert only');
});

test('MEDIUM #18 account feedback has a web alert fallback', () => {
  assert.match(account, /function showAccountAlert/);
  assert.match(account, /window\.alert/);
  assert.equal((account.match(/showAccountAlert\(/g) ?? []).length, 8);
});

test('MEDIUM #18 web account deletion requires two confirmations', () => {
  assert.match(account, /const firstConfirmed = window\.confirm/);
  assert.match(account, /const finalConfirmed = window\.confirm/);
  assert.match(account, /if \(finalConfirmed\) void executeDeleteAccount\(\)/);
});

test('MEDIUM #18 native account deletion keeps Alert confirmation flow', () => {
  const alerts = account.match(/Alert\.alert\(/g) ?? [];
  assert.equal(alerts.length, 3);
});
