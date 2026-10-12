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

/**
 * The hole the tests above left open (found on a device, 12.10.2026).
 *
 * `sendResetEmail` set the guard, then validated the email and returned early when the
 * field was empty or malformed - and that `return` sat BEFORE the `try`. `finally` was
 * therefore never reached, the guard stayed `true` for the rest of the screen's life,
 * and because `submit()` checks the same ref first, ONE tap on "Am uitat parola" with an
 * empty field silently killed "Autentificare" as well: no alert, no spinner, no request.
 * The device proof is the `auth` flow, whose step 2 (the "Email invalid" alert after a tap
 * on "Autentificare") failed on every run of the old build, with the screenshot showing the
 * untouched form.
 *
 * The invariant is therefore: no exit path may leave the guard engaged, which means the
 * validation has to live INSIDE the `try` - the `finally` is the only release site.
 */
test('no early exit in sendResetEmail can bypass the guard release', () => {
  const body = sliceUpToNextDeclaration(auth, 'const sendResetEmail = async () => {', 'const styles = StyleSheet.create(');

  assert.equal(
    (body.match(/submitInFlightRef\.current = false;/g) ?? []).length,
    1,
    'the guard must keep exactly one release site, so no new exit path can forget it',
  );

  const guardOnAt = body.indexOf('submitInFlightRef.current = true;');
  assert.notEqual(guardOnAt, -1, 'sendResetEmail must keep setting the guard');

  const tryAt = body.indexOf('try {');
  assert.notEqual(tryAt, -1, 'sendResetEmail must keep its try block');
  assert.ok(
    tryAt > guardOnAt,
    'the try must open after the guard is set, otherwise the guard would be held while idle',
  );

  // The bail-out above the guard (`if (submitInFlightRef.current || loading) return;`) is fine -
  // it runs before the guard exists. The one that matters is the FIRST exit after the guard is
  // engaged: it has to sit inside the try, because only the finally releases the guard.
  const firstExitAfterGuard = body.indexOf('return;', guardOnAt);
  assert.notEqual(firstExitAfterGuard, -1, 'sendResetEmail must keep its validation exit');
  assert.ok(
    firstExitAfterGuard > tryAt,
    'no exit may sit between the guard and the try: such a return skips the finally, '
      + 'which leaves submitInFlightRef true and turns the whole form (sign-in included) into a silent no-op',
  );
});

test('submit() sets the guard only once the local validation can no longer bail out', () => {
  const body = sliceUpToNextDeclaration(auth, 'const submit = async () => {', 'const backToSignIn');

  const bailOutAt = body.indexOf('if (submitInFlightRef.current || !validate() || loading) return;');
  assert.notEqual(bailOutAt, -1, 'submit must keep its synchronous duplicate-tap guard');
  const guardOnAt = body.indexOf('submitInFlightRef.current = true;');
  assert.ok(
    guardOnAt > bailOutAt,
    'the guard must be set after the validation gates, otherwise a rejected form would hold the guard',
  );
});
