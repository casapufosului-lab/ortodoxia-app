import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = readFileSync('src/app/auth.tsx', 'utf8');
const account = readFileSync('src/app/(tabs)/account.tsx', 'utf8');

test('MEDIUM #18 auth feedback has a web alert fallback', () => {
  assert.match(auth, /function showAuthAlert/);
  assert.match(auth, /Platform\.OS === 'web'/);
  assert.match(auth, /window\.alert/);
  assert.equal((auth.match(/showAuthAlert\(/g) ?? []).length, 11);
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
