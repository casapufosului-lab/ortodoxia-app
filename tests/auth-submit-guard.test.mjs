/**
 * The sign-in path always gives the user a way out (blocker: "autentificarea nu tine").
 *
 * WHY THIS EXISTS
 * ---------------
 * Two defects found while chasing that blocker, both invisible to the existing suites:
 *
 *   1. `submitInFlightRef` was set on the way into `submit()` and released only by
 *      `sendResetEmail()`. One failed attempt therefore left the guard `true` for the
 *      rest of the screen's life, so every later tap on "Autentificare" returned at the
 *      first line - no alert, no spinner, a form that silently does nothing. A user who
 *      mistyped the password once could not retry without leaving the screen, which is
 *      exactly the "formular care se goleste in tacere" the blocker reports.
 *   2. `signInWithPassword` was the only network call in the screen with no time bound
 *      (`withTimeout` was already used for both OAuth calls). A request that never
 *      settles left the button spinning forever instead of showing an error.
 *
 * Both are source-level invariants: the screen cannot be rendered in this suite (no
 * React Native renderer is installed), so these tests read the real source and pin the
 * shape that makes the behaviour true. They are deliberately narrow - they fail if the
 * guard loses its release or the bound is dropped, and do not care about anything else.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const auth = readFileSync('src/app/auth.tsx', 'utf8');

/**
 * Source slice from `startMarker` up to (but excluding) the next top-level declaration.
 * Slicing on the NEXT declaration rather than on a closing brace keeps the check honest
 * when the body grows or gains nested callbacks.
 */
function sliceUpToNextDeclaration(source, startMarker, nextMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `expected to find ${startMarker}`);
  const end = source.indexOf(nextMarker, start);
  assert.notEqual(end, -1, `expected to find ${nextMarker} after ${startMarker}`);
  return source.slice(start, end);
}

test('submit releases the in-flight guard in its finally block', () => {
  const body = sliceUpToNextDeclaration(auth, 'const submit = async () => {', 'const backToSignIn');

  assert.equal(
    (body.match(/submitInFlightRef\.current = true;/g) ?? []).length,
    1,
    'submit must set the duplicate-tap guard exactly once',
  );
  assert.equal(
    (body.match(/submitInFlightRef\.current = false;/g) ?? []).length,
    1,
    'submit must release the duplicate-tap guard exactly once',
  );

  // The release has to be in the `finally`, so it also runs on the failure paths -
  // that is the whole point: a failed attempt must not lock the button.
  const finallyBlock = body.match(/finally \{[\s\S]*?\n    \}/);
  assert.ok(finallyBlock, 'submit must keep its finally block');
  assert.match(
    finallyBlock[0],
    /submitInFlightRef\.current = false;/,
    'the guard must be released in finally, not only on the success path',
  );
});

test('sendResetEmail still releases the same guard', () => {
  const body = sliceUpToNextDeclaration(auth, 'const sendResetEmail = async () => {', 'const styles = StyleSheet.create(');

  assert.match(body, /submitInFlightRef\.current = true;/);
  assert.match(body, /finally \{[\s\S]*?submitInFlightRef\.current = false;/);
});

test('the password sign-in is bounded by a timeout', () => {
  assert.match(auth, /const SIGN_IN_TIMEOUT_MS = 30_000;/);
  assert.match(
    auth,
    /await withTimeout\(\s*\n\s*supabase\.auth\.signInWithPassword\(/,
    'signInWithPassword must go through withTimeout, like the OAuth calls',
  );
});

test('a failed sign-in stays on the visible alert path', () => {
  assert.match(auth, /showAuthAlert\(t\('auth\.signInFailedTitle'\), friendlyAuthError\(error, t\)\)/);
  // The timeout message must map to the connection-error string, not to the generic one:
  // `friendlyAuthError` matches on substrings, so the wording is load-bearing.
  assert.match(auth, /'Sign-in network request timed out\.'/);
  const mapper = sliceUpToNextDeclaration(auth, 'function friendlyAuthError(', 'function hasRecoveryRedirect');
  assert.match(mapper, /msg\.includes\('network'\)[\s\S]*?auth\.errorNetwork/);
});
