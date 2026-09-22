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
  // The assertion is about which handler runs, not about the attribute list, so it
  // matches the Pressable regardless of the accessibility props added by A11Y-001.
  assert.match(auth, /<Pressable\b[^>]*\bonPress=\{backToSignIn\}/);
  assert.doesNotMatch(auth, /onPress=\{\(\) => setMode\('sign-in'\)\}/);
});
