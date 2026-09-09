import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const auth = readFileSync('src/app/auth.tsx', 'utf8');

test('LOW #21 back to sign-in exits password recovery explicitly', () => {
  assert.match(auth, /const backToSignIn = async \(\) => \{/);
  assert.match(auth, /await signOut\(\)/);
  assert.match(auth, /clearRecoveryRedirect\(\)/);
  assert.match(auth, /setMode\('sign-in'\)/);
});

test('LOW #21 reset-password back button uses recovery exit handler', () => {
  assert.match(auth, /<Pressable onPress=\{backToSignIn\}>/);
  assert.doesNotMatch(auth, /onPress=\{\(\) => setMode\('sign-in'\)\}/);
});
