/**
 * Configurația de release (`app.json` + `eas.json`): ce pleacă spre magazine.
 *
 * Ce dovedesc testele:
 *   A. profilul de producție are toate variabilele publice cerute de aplicație;
 *   B. în el NU ajunge niciun secret de server (cheie de service, token, secret);
 *   C. numărul de build crește automat (altfel al doilea upload e respins de magazin);
 *   D. o cheie RevenueCat de TEST este semnalată de poarta de release (nu poate vinde nimic);
 *   E. identitatea aplicației (slug, owner, projectId, bundle/package, scheme) e completă;
 *   F. mesajele de permisiune iOS din `app.json` sunt identice cu cele din pluginul de dictare;
 *   G. URL-urile legale trimit la site-ul publicat, nu la exemple.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = JSON.parse(readFileSync(resolve('app.json'), 'utf8'));
const eas = JSON.parse(readFileSync(resolve('eas.json'), 'utf8'));
const gate = readFileSync(resolve('scripts/release-readiness.mjs'), 'utf8');

const production = eas?.build?.production ?? {};
const env = production.env ?? {};
const expo = app?.expo ?? {};

test('A. profilul de producție are toate variabilele publice cerute', () => {
  const required = [
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_LEGAL_ENTITY',
    'EXPO_PUBLIC_SUPPORT_EMAIL',
    'EXPO_PUBLIC_LEGAL_POSTAL_ADDRESS',
    'EXPO_PUBLIC_LEGAL_JURISDICTION',
    'EXPO_PUBLIC_LEGAL_EFFECTIVE_DATE',
    'EXPO_PUBLIC_PRIVACY_POLICY_URL',
    'EXPO_PUBLIC_TERMS_URL',
  ];
  for (const name of required) {
    assert.equal(typeof env[name], 'string', `${name} lipsește din profilul de producție`);
    assert.ok(env[name].trim().length > 0, `${name} este gol`);
  }
  assert.match(env.EXPO_PUBLIC_SUPABASE_URL, /^https:\/\/[a-z]+\.supabase\.co$/);
  assert.match(env.EXPO_PUBLIC_SUPPORT_EMAIL, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);

  // Fiecare profil care poate produce o aplicație instalabilă are nevoie de aceleași valori: altfel
  // build-ul de test pornește și crapă la importul clientului Supabase.
  for (const profileName of ['development', 'preview']) {
    const profileEnv = eas?.build?.[profileName]?.env ?? {};
    const missing = required.filter((name) => typeof profileEnv[name] !== 'string' || profileEnv[name].trim() === '');
    assert.deepEqual(missing, [], `${profileName} nu poate porni fără: ${missing.join(', ')}`);
  }

  // Și valorile trebuie să coincidă între profile (altfel diferența se vede doar pe telefon).
  const seen = new Map();
  for (const [profileName, profile] of Object.entries(eas?.build ?? {})) {
    for (const [name, value] of Object.entries(profile?.env ?? {})) {
      if (!name.startsWith('EXPO_PUBLIC_') || /REVENUECAT/.test(name)) continue;
      if (seen.has(name)) {
        assert.equal(value, seen.get(name).value, `${name} diferă între ${seen.get(name).profile} și ${profileName}`);
      } else {
        seen.set(name, { profile: profileName, value });
      }
    }
  }
  // Poarta verifică aceeași regulă, ca o diferență să nu treacă neobservată la release.
  assert.match(gate, /public values differ between profiles/);
});

test('B. în profilul de producție nu ajunge niciun secret de server', () => {
  const forbidden = Object.keys(env).filter((name) => /SERVICE_ROLE|SECRET|_TOKEN$|PASSWORD/i.test(name));
  assert.deepEqual(forbidden, [], `nu au ce căuta în bundle: ${forbidden.join(', ')}`);
  // Cheia publicabilă Supabase este publică prin definiție; cea de service nu are ce căuta aici.
  assert.equal(JSON.stringify(eas).includes('service_role'), false);
});

test('C. numărul de build crește automat', () => {
  assert.equal(production.autoIncrement, true, 'fără autoIncrement, al doilea upload refolosește același versionCode');
  assert.equal(typeof expo.android?.versionCode, 'number');
  assert.equal(typeof expo.ios?.buildNumber, 'string');
});

test('D. o cheie RevenueCat de test este semnalată de poartă', () => {
  const revenueCatValues = Object.entries(env).filter(([name]) => /REVENUECAT/.test(name));
  assert.ok(revenueCatValues.length > 0, 'profilul trebuie să declare cheile RevenueCat (chiar și ca test)');
  const testKeys = revenueCatValues.filter(([, value]) => typeof value === 'string' && value.startsWith('test_'));
  if (testKeys.length > 0) {
    // Starea de azi: cheia Google este încă cea de test → poarta trebuie s-o spună tare.
    assert.match(gate, /REVENUECAT/, 'poarta trebuie să verifice cheile RevenueCat');
    assert.match(gate, /startsWith\('test_'\)/, 'poarta trebuie să recunoască o cheie de test');
    assert.match(gate, /RevenueCat TEST key/, 'mesajul de avertizare trebuie să fie explicit');
  } else {
    // Dacă între timp cheile reale au fost puse, verificăm că nu mai există niciuna de test.
    assert.equal(testKeys.length, 0);
  }
});

test('E. identitatea aplicației e completă și consecventă', () => {
  assert.equal(expo.name, 'Ortodoxia');
  assert.equal(expo.slug, 'ortodoxia');
  assert.equal(expo.owner, 'ortodoxia');
  assert.match(expo?.extra?.eas?.projectId ?? '', /^[0-9a-f-]{36}$/);
  assert.equal(expo.scheme, 'ortodoxia');
  assert.equal(expo.ios?.bundleIdentifier, 'ro.ortodoxia.app');
  assert.equal(expo.android?.package, 'ro.ortodoxia.app');
  // Slug-ul și owner-ul trebuie să corespundă proiectului EAS existent; verificarea online se face cu
  // `npx eas-cli project:info`. Aici verificăm doar că nu au rămas două valori diferite în depozit.
  const appJson = readFileSync(resolve('app.json'), 'utf8');
  assert.equal((appJson.match(/"slug":/g) ?? []).length, 1);
  assert.equal(appJson.includes('ortodoxia-app"'), false, 'slug-ul vechi nu mai are ce căuta în config');
});

test('F. mesajele de permisiune iOS sunt identice cu cele din pluginul de dictare', () => {
  const plugin = (expo.plugins ?? []).find((entry) => Array.isArray(entry) && entry[0] === 'expo-speech-recognition');
  assert.ok(Array.isArray(plugin), 'pluginul expo-speech-recognition trebuie configurat (permisiuni + microfon)');
  const config = plugin[1] ?? {};
  assert.equal(expo.ios.infoPlist.NSSpeechRecognitionUsageDescription, config.speechRecognitionPermission);
  assert.equal(expo.ios.infoPlist.NSMicrophoneUsageDescription, config.microphonePermission);
  assert.ok((expo.android.permissions ?? []).includes('android.permission.RECORD_AUDIO'));
  // Mesajele sunt în română, ca restul aplicației, și spun la ce folosește permisiunea.
  assert.match(config.microphonePermission, /microfon/i);
  assert.match(config.speechRecognitionPermission, /vocea|dictat/i);
});

test('G. URL-urile legale trimit la site-ul publicat, nu la exemple', () => {
  assert.equal(env.EXPO_PUBLIC_PRIVACY_POLICY_URL, 'https://ortodoxia.web.app/privacy');
  assert.equal(env.EXPO_PUBLIC_TERMS_URL, 'https://ortodoxia.web.app/terms');
  // Atenție la tipar: „ortodoxia" conține „todo", deci un `TODO` naiv ar da fals pozitiv.
  assert.equal(/(example\.(com|org)|localhost|127\.0\.0\.1|your_|REPLACE_ME|TODO:)/i.test(JSON.stringify(env)), false);
  // Profilul de trimitere există, ca `eas submit` să nu ceară profilul interactiv.
  assert.ok(eas.submit !== undefined && eas.submit.production !== undefined);
  assert.equal(eas.cli.version.length > 0, true);
});
