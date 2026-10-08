/**
 * Poziția B6 din audit: o cheie de magazin goală sau de test în profilul de release
 * trebuie să oprească build-ul.
 *
 * Ce dovedesc testele (executând codul real, nu citind textul):
 *   A. ce valori NU pot lua niciodată o plată (lipsă, gol, spații, placeholder, Test Store);
 *   B. ce valori sunt acceptate;
 *   C. forma exactă de azi (`EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: ""` în profilul
 *      production) este raportată ca neutilizabilă;
 *   D. poarta folosește această decizie (un singur loc care decide) și o transformă în
 *      FAIL la `--release`, nu în PASS;
 *   E. cheia care ține de App Store nu blochează lansarea Google Play (rămâne DEFERRED).
 *
 * Dovada „poarta chiar cade" se face separat, cu eas.json mutat temporar:
 * `node scripts/prove-store-key-gate-fails.mjs` (vezi și istoricul din docs).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { STORE_KEY_PLATFORMS, evaluateStoreKeys, isUsableStoreKey } from '../scripts/lib/store-keys.mjs';

const GOOGLE = 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY';
const APPLE = 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY';

const gate = readFileSync(resolve('scripts/release-readiness.mjs'), 'utf8');

test('A. valorile care nu pot lua o plată sunt respinse', () => {
  const unusable = [
    undefined,
    null,
    42,
    {},
    '',
    '   ',
    '\n\t',
    'test_AbCdEf',      // cheia de Test Store folosită în dezvoltare
    'test-abcdef',
    'teststore_abc',
    'your_google_api_key_here',
    'REPLACE_ME',
    'CHANGEME',
    'xxx',
  ];
  for (const value of unusable) {
    assert.equal(isUsableStoreKey(value), false, `ar fi trebuit respinsă: ${JSON.stringify(value)}`);
  }
});

test('B. cheile publice reale sunt acceptate (cu spații în jur tolerate)', () => {
  for (const value of ['goog_AbCd1234567890', 'appl_AbCd1234567890', '  goog_x  ']) {
    assert.equal(isUsableStoreKey(value), true, `ar fi trebuit acceptată: ${value}`);
  }
});

test('C. starea de azi (cheie goală în profilul production) e prinsă', () => {
  const evaluated = evaluateStoreKeys({ [GOOGLE]: '', [APPLE]: '' });
  const google = evaluated.find((entry) => entry.name === GOOGLE);
  assert.equal(google.declared, true, 'câmpul există în eas.json, deci e „declarat"');
  assert.equal(google.usable, false, 'un șir gol nu poate lua nicio plată');

  // Fără câmp deloc: tot neutilizabil, dar „nedeclarat" (poate fi completat din EAS env).
  const absent = evaluateStoreKeys({}).find((entry) => entry.name === GOOGLE);
  assert.equal(absent.declared, false);
  assert.equal(absent.usable, false);

  // Cheia de test: nedeclarată ca fiind de test, dar neutilizabilă.
  const fromTestStore = evaluateStoreKeys({ [GOOGLE]: 'test_abc' }).find((entry) => entry.name === GOOGLE);
  assert.equal(fromTestStore.usable, false);
});

test('C2. o cheie reală pentru Google trece, iar profilurile sunt cele știute', () => {
  const evaluated = evaluateStoreKeys({ [GOOGLE]: 'goog_real_key_123' });
  assert.deepEqual(
    evaluated.map((entry) => entry.name),
    [GOOGLE, APPLE],
  );
  assert.equal(evaluated.find((entry) => entry.name === GOOGLE).usable, true);
  // Fără valoare, cheia App Store rămâne neutilizabilă, dar nu e obligatorie pentru lansarea de față.
  assert.equal(evaluated.find((entry) => entry.name === APPLE).usable, false);
  const apple = STORE_KEY_PLATFORMS.find((entry) => entry.name === APPLE);
  assert.equal(apple.requiredForThisLaunch, false, 'iOS nu face parte din lansarea Google Play');
});

test('D. poarta folosește decizia și dă FAIL la --release, nu PASS', () => {
  // Un singur loc care decide: modulul pur.
  assert.match(gate, /from '\.\/lib\/store-keys\.mjs'/, 'poarta trebuie să importe decizia testată');
  assert.match(gate, /evaluateStoreKeys\(env\)/, 'poarta trebuie să evalueze profilul production cu ea');

  // Cheia de magazin goală NU are voie să treacă drept PASS la release.
  const start = gate.indexOf('const storeKeys = evaluateStoreKeys(env)');
  assert.ok(start > 0, 'blocul de verificare a cheilor trebuie să existe');
  const block = gate.slice(start, start + 1800);
  assert.match(block, /cannot sell anything/, 'mesajul trebuie să spună că nu se poate vinde nimic');
  assert.match(block, /RELEASE_MODE \? 'FAIL' : 'DEFERRED'/, 'la release trebuie să fie FAIL');
  assert.match(block, /record\('PASS'[\s\S]*usable store key/, 'PASS doar pe ramura cu cheie utilizabilă');
});

test('E. cheile care nu fac parte din această lansare rămân DEFERRED, nu FAIL', () => {
  // RELEASE_PUBLIC_ENV (FAIL la release) nu are voie să conțină cheia App Store.
  const start = gate.indexOf('const RELEASE_PUBLIC_ENV');
  const end = gate.indexOf('];', start);
  const block = gate.slice(start, end);
  assert.equal(block.includes(APPLE), false, 'cheia App Store nu poate bloca un build pentru Google Play');
  assert.match(block, /EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY/, 'cheia Google este obligatorie');
  assert.match(gate, /const IOS_ONLY_PUBLIC_ENV = \[\s*'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY'/, 'cheia App Store e listată separat');
  assert.match(gate, /iOS-only variables not set locally|App Store-only variables not set locally/, 'și raportată explicit');
});
