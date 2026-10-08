/**
 * B2: un singur adevăr pentru adresa de întoarcere a autentificării native.
 *
 * Înainte, OAuth-ul folosea `Linking.createURL('auth')`, care întoarce
 * `ortodoxia://auth` doar într-un build de producție și altceva (`exp://…`) în Expo Go
 * sau într-un build de development — o adresă care nu e înregistrată în manifest și
 * către care Supabase nu poate redirecționa niciodată. Helperul de recuparare a parolei
 * folosea deja constanta `ortodoxia://auth`. Acum ambele citesc aceeași sursă.
 *
 * Testele pot pica: schimbă valoarea literei din helper → primul test cade; pune la loc
 * `Linking.createURL` în ecran → al doilea test cade.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const helper = readFileSync(join(root, 'src/lib/native-password-recovery.ts'), 'utf8');
const authScreen = readFileSync(join(root, 'src/app/auth.tsx'), 'utf8');

/**
 * Source with comments removed, so a comment that merely *mentions* the old call
 * cannot fail (or pass) a check meant for code.
 *
 * A line comment only starts at the beginning of a line or after whitespace, which
 * keeps `://` inside string literals — `ortodoxia://auth`, `https://…` — intact.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');
}

const authScreenCode = stripComments(authScreen);

test('B2: the native return address is defined exactly once', () => {
  // Litera apare o singură dată, în helper...
  assert.ok(
    helper.includes("NATIVE_PASSWORD_RECOVERY_REDIRECT_URL = 'ortodoxia://auth'"),
    'adresa nativă de întoarcere trebuie definită în helper',
  );
  // ...iar numele folosit de OAuth e derivat din ea, nu o a doua literă.
  assert.ok(
    helper.includes('NATIVE_AUTH_REDIRECT_URL = NATIVE_PASSWORD_RECOVERY_REDIRECT_URL'),
    'NATIVE_AUTH_REDIRECT_URL trebuie să fie aliasul aceleiași valori, nu o a doua definiție',
  );

  const literals = helper.match(/'ortodoxia:\/\/auth'/g) ?? [];
  assert.equal(literals.length, 1, 'valoarea trebuie să apară o singură dată în helper');
});

test('B2: the OAuth redirect uses that constant, not Linking.createURL', () => {
  const start = authScreenCode.indexOf('function getAuthRedirectUrl()');
  assert.notEqual(start, -1, 'getAuthRedirectUrl trebuie să existe în continuare');
  const end = authScreenCode.indexOf('function authErrorFromUrl', start);
  assert.notEqual(end, -1);
  const body = authScreenCode.slice(start, end);

  assert.ok(body.includes('NATIVE_AUTH_REDIRECT_URL'), 'ramura nativă trebuie să întoarcă constanta');
  assert.ok(
    !/Linking\.createURL/.test(authScreenCode),
    'Linking.createURL a fost chiar cauza diferenței dintre Expo Go și producție; nu are ce căuta în ecran',
  );
});

test('B2: the sign-up confirmation e-mail and the OAuth flow share the same target', () => {
  // Ambele căi trebuie să ajungă la aceeași adresă, altfel revine divergența pe care
  // B2 o închide: un cont confirmat pe o adresă, OAuth pe alta.
  assert.ok(authScreen.includes(': NATIVE_PASSWORD_RECOVERY_REDIRECT_URL,'), 'emailRedirectTo folosește constanta');
  assert.ok(authScreen.includes('NATIVE_AUTH_REDIRECT_URL'), 'redirectTo de OAuth folosește constanta');
});
