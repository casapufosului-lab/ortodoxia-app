import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const recoveryHelper = readFileSync(join(root, 'src/lib/native-password-recovery.ts'), 'utf8');
const supabaseClient = readFileSync(join(root, 'src/lib/supabase.ts'), 'utf8');
const authScreen = readFileSync(join(root, 'src/app/auth.tsx'), 'utf8');

// The parser is pure and import-free on purpose, so the tests exercise the real
// function instead of grepping its source.
const { parseAuthLink, resolveLinkType, isSupportedLinkType } = await import(
  new URL('../src/lib/auth-link.ts', import.meta.url).href
);

test('B8/PKCE: a link that carries a code is recognised as a code exchange', () => {
  assert.deepEqual(parseAuthLink('ortodoxia://auth?code=9f8a-xyz'), {
    kind: 'code',
    code: '9f8a-xyz',
    declaredType: null,
  });
  assert.equal(parseAuthLink('ortodoxia://auth?code=9f8a-xyz#xyz').kind, 'code');
});

test('B8/PKCE: session tokens in the URL are refused, never consumed', () => {
  // This is the audited defect: the implicit flow delivered access_token and
  // refresh_token in the fragment, where any app registered for the same scheme
  // could read them.
  assert.equal(
    parseAuthLink('ortodoxia://auth#access_token=aaa&refresh_token=bbb&type=recovery').kind,
    'implicit_tokens',
  );
  assert.equal(
    parseAuthLink('ortodoxia://auth?access_token=aaa&refresh_token=bbb').kind,
    'implicit_tokens',
  );
  assert.equal(parseAuthLink('ortodoxia://auth?type=recovery&access_token=aaa').kind, 'implicit_tokens');
});

test('B8/PKCE: a declared link type is kept when the link carries one', () => {
  const signup = parseAuthLink('ortodoxia://auth?type=signup&code=abc');
  assert.equal(signup.kind, 'code');
  assert.equal(signup.declaredType, 'signup');

  const recovery = parseAuthLink('ortodoxia://auth?type=recovery&code=abc');
  assert.equal(recovery.kind, 'code');
  assert.equal(recovery.declaredType, 'recovery');

  const unknown = parseAuthLink('ortodoxia://auth?type=other&code=abc');
  assert.equal(unknown.kind, 'code');
  assert.equal(unknown.declaredType, null);
});

test('B8/PKCE: unrelated or empty links are not treated as auth links', () => {
  assert.equal(parseAuthLink(null).kind, 'none');
  assert.equal(parseAuthLink('').kind, 'none');
  assert.equal(parseAuthLink('ortodoxia://auth').kind, 'none');
  assert.equal(parseAuthLink('ortodoxia://bible/ioan-3?verse=16').kind, 'none');
  // A recovery type without a code cannot produce a session, so it is not a link we can consume.
  assert.equal(parseAuthLink('ortodoxia://auth?type=recovery').kind, 'none');

  assert.equal(isSupportedLinkType('recovery'), true);
  assert.equal(isSupportedLinkType('signup'), true);
  assert.equal(isSupportedLinkType('something-else'), false);
  assert.equal(isSupportedLinkType(null), false);
});

test('B8/PKCE: the reset screen decision still honours the recovery intent', () => {
  assert.equal(resolveLinkType('recovery', false), 'recovery');
  assert.equal(resolveLinkType(null, true), 'recovery');
  assert.equal(resolveLinkType('signup', false), 'signup');
  assert.equal(resolveLinkType(null, false), 'signup');
});

test('B8/PKCE: the Supabase client is configured for the code exchange flow', () => {
  assert.ok(
    supabaseClient.includes("flowType: 'pkce'"),
    'createClient must request the pkce flow, otherwise the e-mail links keep carrying tokens',
  );
});

test('B8/PKCE: the recovery helper trades the code for a session and never reads URL tokens', () => {
  assert.ok(recoveryHelper.includes('exchangeCodeForSession'));
  assert.ok(!recoveryHelper.includes("getUrlParam(url, 'access_token')"));
  assert.ok(!recoveryHelper.includes("getUrlParam(url, 'refresh_token')"));
  assert.ok(
    !/supabase\.auth\.setSession\(/.test(recoveryHelper),
    'setSession built from URL tokens must not come back',
  );
  assert.ok(recoveryHelper.includes('markPasswordRecoveryRequested'));
});

test('B8/PKCE: requesting a reset remembers the intent for the returning link', () => {
  // After the exchange the code carries no purpose, so the app records that a reset
  // was asked for and uses that to open the reset form.
  assert.ok(authScreen.includes('markPasswordRecoveryRequested'));
});
