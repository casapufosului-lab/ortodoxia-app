/**
 * SIWA-1: autentificarea cu Apple trebuie să existe și să fie cea NATIVĂ, pe iOS.
 *
 * Cazul real: aplicația avea login cu email + Google, dar nu avea „Sign in with Apple".
 * Apple respinge versiunea la review (ghidul 4.8: cine oferă login social terț trebuie să
 * ofere și Sign in with Apple). Ecranul avea un buton Apple desenat manual, care mergea
 * prin fluxul WEB cu redirect — pe iOS calea corectă e cea nativă, cu butonul oficial al
 * sistemului și `signInWithIdToken`.
 *
 * Testele de mai jos apără exact acele puncte, pe sursa reală:
 * - butonul oficial e înlocuit cu unul desenat manual          → testul 3 cade;
 * - dispare poarta `Platform.OS === 'ios'`                     → testul 4 cade;
 * - `isAvailableAsync()` nu mai e consultat                    → testul 5 cade;
 * - fluxul nativ e înlocuit cu `signInWithOAuth` (redirect)    → testul 6 cade;
 * - `signInWithIdToken` pierde `provider: 'apple'`/`token`     → testul 7 cade;
 * - anularea de către utilizator ajunge la alertă              → testul 8 cade;
 * - fluxurile de email/parolă sau Google sunt atinse           → testul 9 cade.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const authScreenRaw = readFileSync(join(root, 'src/app/auth.tsx'), 'utf8');
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/**
 * Sursa fără comentarii de bloc: afirmațiile de mai jos trebuie să fie despre COD.
 * Fără curățare, un comentariu care pomenește `signInWithIdToken` (exact cel care
 * explică de ce fluxul web nu se folosește) ar face testul să cadă pe propria explicație.
 */
const authScreen = authScreenRaw.replace(/\/\*[\s\S]*?\*\//g, '');

/** Textul dintre două marcaje, cu ambele marcaje găsite obligatoriu. */
function between(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `nu am găsit „${startMarker}" în sursă`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `nu am găsit „${endMarker}" după „${startMarker}"`);
  return source.slice(start, end + endMarker.length);
}

/**
 * Corpul unei funcții declarate la nivel de componentă: de la declarație până la
 * următoarea declarație `const`/`function` de același nivel.
 */
function functionBody(source, marker) {
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `nu am găsit „${marker}" în sursă`);
  const rest = source.slice(start);
  const nextDeclaration = rest.slice(marker.length).search(/\n(?:  )?(?:const|function) /);
  assert.notEqual(nextDeclaration, -1, `nu am putut delimita corpul lui „${marker}"`);
  return rest.slice(0, marker.length + nextDeclaration);
}

const nativeHandler = functionBody(authScreen, 'const signInWithApple = async () => {');
const nativeButton = between(
  authScreen,
  '<AppleAuthentication.AppleAuthenticationButton',
  '/>',
);
const appleAvailabilityEffect = between(
  authScreen,
  'void AppleAuthentication.isAvailableAsync()',
  'const validate = () => {',
);
const cancelHelper = functionBody(authScreen, 'function isAppleSignInCancelled(error: unknown): boolean {');

test('SIWA-1: expo-apple-authentication este o dependență declarată, din linia SDK 57', () => {
  const declared = packageJson.dependencies?.['expo-apple-authentication'];
  assert.ok(declared, 'pachetul oficial expo-apple-authentication trebuie declarat în dependencies');
  assert.match(declared, /^~?57\./, `versiunea trebuie să fie din linia SDK 57, este „${declared}"`);
});

test('SIWA-1: app.json cere Sign in with Apple pentru iOS, cu bundle id-ul neschimbat', () => {
  // `usesAppleSignIn` este comutatorul documentat; entitlementul
  // `com.apple.developer.applesignin` vine din pluginul pachetului instalat mai sus
  // (dovadă prin `npx expo config --type introspect`, nu prin acest test).
  assert.equal(appJson.expo?.ios?.usesAppleSignIn, true, 'app.json trebuie să declare ios.usesAppleSignIn');
  assert.equal(appJson.expo?.ios?.bundleIdentifier, 'ro.ortodoxia.app');
});

test('SIWA-1: pe iOS se folosește butonul OFICIAL al sistemului, nu unul desenat manual', () => {
  assert.match(
    authScreen,
    /AppleAuthentication\.AppleAuthenticationButton\b/,
    'butonul Apple de pe iOS trebuie să fie AppleAuthenticationButton (randat de sistem)',
  );
  assert.match(nativeButton, /AppleAuthenticationButtonType\.SIGN_IN/, 'tipul cerut e SIGN_IN');
  // Stilul se dă prin proprietățile butonului oficial; fundalul și colțurile din `style`
  // sunt documentate ca neacceptate și ar însemna un buton desenat manual.
  assert.doesNotMatch(nativeButton, /backgroundColor/, 'butonul oficial nu se recolorează din style');
  assert.doesNotMatch(nativeButton, /borderRadius/, 'colțurile se dau prin cornerRadius');
  assert.match(nativeButton, /cornerRadius=\{/, 'butonul oficial are nevoie de cornerRadius');
  assert.match(nativeButton, /buttonStyle=\{/, 'butonul oficial are nevoie de buttonStyle');
  assert.match(nativeButton, /onPress=\{signInWithApple\}/, 'butonul chemă fluxul nativ');
});

test('SIWA-1: butonul nativ este randat doar pe iOS, iar cel prin flux web doar pe non-iOS', () => {
  assert.match(
    authScreen,
    /\{Platform\.OS === 'ios' && appleAvailable \? \(/,
    'randarea butonului nativ trebuie condiționată de iOS, nu necondiționată',
  );
  // Butonul vechi (flux web cu redirect) nu are voie să se randeze pe iOS: două butoane
  // Apple pe același ecran, dintre care unul prin redirect, e exact ce respinge Apple.
  assert.match(
    authScreen,
    /\{Platform\.OS !== 'ios' && isProviderEnabled\(providerAvailability, 'apple'\) \? \(/,
    'butonul Apple prin flux web trebuie să rămână doar pe non-iOS',
  );
});

test('SIWA-1: disponibilitatea se cere sistemului, iar lipsa ei ascunde butonul', () => {
  assert.match(
    appleAvailabilityEffect,
    /AppleAuthentication\.isAvailableAsync\(\)/,
    'butonul trebuie să apară doar dacă sistemul îl are',
  );
  assert.match(
    appleAvailabilityEffect,
    /\.catch\(\(\) => \{ if \(active\) setAppleAvailable\(false\); \}\)/,
    'o verificare care pică trebuie să lase butonul ascuns, nu să spargă ecranul',
  );
  assert.match(
    authScreen,
    /const \[appleAvailable, setAppleAvailable\] = useState\(false\)/,
    'starea inițială trebuie să fie „indisponibil", nu „disponibil"',
  );
});

test('SIWA-1: pe iOS legătura se face prin fluxul nativ, nu prin OAuth cu redirect', () => {
  assert.doesNotMatch(
    nativeHandler,
    /signInWithOAuth/,
    'fluxul nativ nu are voie să treacă prin signInWithOAuth (redirect în browser)',
  );
  assert.doesNotMatch(nativeHandler, /WebBrowser\./, 'fluxul nativ nu deschide browserul');
  assert.match(nativeHandler, /AppleAuthentication\.signInAsync\(/, 'credentialul se cere prin signInAsync');
});

test('SIWA-1: tokenul nativ ajunge la Supabase prin signInWithIdToken(provider: apple)', () => {
  assert.match(
    nativeHandler,
    /supabase\.auth\.signInWithIdToken\(\{\s*provider: 'apple',\s*token: credential\.identityToken\s*\}\)/,
    'legătura cu Supabase trebuie făcută cu provider „apple" și tokenul de identitate',
  );
  // `identityToken` e tipat `string | null`: fără verificare, apelul nu are tip sigur.
  assert.match(nativeHandler, /if \(!credential\.identityToken\)/, 'tokenul lipsă se tratează explicit');
  assert.match(nativeHandler, /withTimeout\(/, 'cererea de rețea trebuie limitată în timp');
  assert.match(nativeHandler, /router\.replace\(destination\)/, 'după autentificare omul merge mai departe');
});

test('SIWA-1: anularea de către utilizator nu produce alertă, eroarea reală da', () => {
  assert.match(cancelHelper, /ERR_REQUEST_CANCELED/, 'anularea se recunoaște după codul dat de sistem');
  // Ordinea contează: ieșirea pe anulare trebuie să fie ÎNAINTE de alertă, altfel omul
  // care doar a închis foaia primește o eroare.
  assert.match(
    nativeHandler,
    /if \(isAppleSignInCancelled\(error\)\) return;\s*\n\s*showAuthAlert\(/,
    'anularea iese înainte de showAuthAlert; restul erorilor ajung la mesajul existent',
  );
  assert.match(nativeHandler, /friendlyAuthError\(error, t\)/, 'eroarea reală folosește mesajul de la Google');
});

test('SIWA-1: fluxurile de email/parolă și Google rămân neatinse', () => {
  assert.match(authScreen, /signInWithPassword\(/, 'autentificarea cu parolă trebuie să rămână');
  assert.match(authScreen, /signInWithOAuth\('google'\)/, 'butonul Google rămâne pe fluxul OAuth');
  const oauthHandler = functionBody(
    authScreen,
    "const signInWithOAuth = async (provider: 'google' | 'apple') => {",
  );
  assert.doesNotMatch(oauthHandler, /signInWithIdToken/, 'fluxul OAuth nu folosește signInWithIdToken');
});
