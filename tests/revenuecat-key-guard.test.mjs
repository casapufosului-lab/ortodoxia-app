/**
 * Garda care decide dacă o cheie RevenueCat poate ajunge în `Purchases.configure()`.
 *
 * Ce apără acest test (blocantul cel mai grav din raportul de lansare):
 *   A. o cheie RevenueCat de *Test Store* (`test_…`) este tratată ca "fără cheie";
 *   B. deci nu ajunge niciodată în `Purchases.configure()` într-un build de release,
 *      unde SDK-ul nativ răspunde cu un modal fatal ("Wrong API Key … The app will
 *      close now") care omoară procesul la pornire;
 *   C. aplicația pornește chiar dacă configurarea RevenueCat eșuează;
 *   D. niciun profil EAS nu mai livrează o cheie de test.
 *
 * Testele rulează implementarea reală din `src/lib/revenuecat.ts` (transpilată în vm),
 * nu o copie a ei, ca o schimbare viitoare să nu poată trece neobservată.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const lib = readFileSync(join(root, 'src/lib/revenuecat.ts'), 'utf8');
const layout = readFileSync(join(root, 'src/app/_layout.tsx'), 'utf8');
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8'));

/** Rulează funcția reală `isPlaceholderRevenueCatKey` fără să exporte nimic în plus. */
function loadRealGuard() {
  const start = lib.indexOf('export function isPlaceholderRevenueCatKey');
  const end = lib.indexOf('export function isRevenueCatConfigured', start);

  assert.ok(start >= 0, 'isPlaceholderRevenueCatKey lipsește din src/lib/revenuecat.ts');
  assert.ok(end > start, 'nu s-a putut delimita isPlaceholderRevenueCatKey');

  const sliced = lib
    .slice(start, end)
    .replace('export function isPlaceholderRevenueCatKey', 'function isPlaceholderRevenueCatKey');

  const instrumented = `${sliced}
globalThis.__isPlaceholderRevenueCatKey = isPlaceholderRevenueCatKey;
`;

  const javascript = ts.transpileModule(instrumented, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;

  const context = vm.createContext({});
  vm.runInContext(javascript, context);

  assert.equal(typeof context.__isPlaceholderRevenueCatKey, 'function');
  return context.__isPlaceholderRevenueCatKey;
}

const isPlaceholder = loadRealGuard();

test('garda respinge cheile lipsă sau goale', () => {
  assert.equal(isPlaceholder(undefined), true);
  assert.equal(isPlaceholder(null), true);
  assert.equal(isPlaceholder(''), true);
  assert.equal(isPlaceholder('   '), true);
});

test('garda respinge placeholder-ele din .env.example', () => {
  assert.equal(isPlaceholder('your_google_api_key_here'), true);
  assert.equal(isPlaceholder('YOUR_APPLE_API_KEY_HERE'), true);
  assert.equal(isPlaceholder('REPLACE_ME'), true);
  assert.equal(isPlaceholder('CHANGEME'), true);
  assert.equal(isPlaceholder('xxxxxxxxxxxxxxxxxxxxx'), true);
});

test('garda respinge o cheie RevenueCat de Test Store, în orice formă', () => {
  // Forma reală din profilul de producție înainte de reparație.
  assert.equal(isPlaceholder('test_hVIDVoaJiBadAmRvNXnXpadrmFl'), true);
  assert.equal(isPlaceholder('TEST_hVIDVoaJiBadAmRvNXnXpadrmFl'), true);
  assert.equal(isPlaceholder('test-store-key'), true);
  assert.equal(isPlaceholder('teststore_key'), true);
  // Spații în jurul valorii nu o fac utilizabilă.
  assert.equal(isPlaceholder('  test_hVIDVoaJiBadAmRvNXnXpadrmFl  '), true);
});

test('garda acceptă cheile publice reale ale magazinelor', () => {
  assert.equal(isPlaceholder('goog_AbCdEfGhIjKlMnOpQrStUvWx'), false);
  assert.equal(isPlaceholder('appl_AbCdEfGhIjKlMnOpQrStUvWx'), false);
  assert.equal(isPlaceholder('amzn_AbCdEfGhIjKlMnOpQrStUvWx'), false);
});

test('configureRevenueCat iese înainte de Purchases.configure când cheia nu e utilizabilă', () => {
  const start = lib.indexOf('export function configureRevenueCat');
  const end = lib.indexOf('export function isPlaceholderRevenueCatKey', start);
  assert.ok(start >= 0 && end > start, 'nu s-a putut delimita configureRevenueCat');

  const block = lib.slice(start, end);
  const guard = block.indexOf('if (!apiKey || isPlaceholderRevenueCatKey(apiKey))');
  const earlyReturn = block.indexOf('return;', guard);
  const configure = block.indexOf('Purchases.configure({ apiKey })');

  assert.ok(guard >= 0, 'configureRevenueCat trebuie să verifice cheia cu garda');
  assert.ok(earlyReturn > guard, 'cheia neutilizabilă trebuie să oprească funcția');
  assert.ok(configure > earlyReturn, 'Purchases.configure nu are voie să ruleze înaintea ieșirii');
});

test('pornirea aplicației nu depinde de configurarea RevenueCat', () => {
  const call = layout.indexOf('configureRevenueCat()');
  assert.ok(call >= 0, '_layout.tsx trebuie să configureze RevenueCat la pornire');

  const before = layout.slice(0, call);
  const tryBlock = before.lastIndexOf('try {');
  const catchBlock = layout.indexOf('catch', call);

  assert.ok(tryBlock >= 0, 'apelul trebuie să fie în interiorul unui try');
  assert.ok(catchBlock > call, 'apelul trebuie să aibă un catch după el');
});

test('niciun profil EAS nu mai livrează o cheie RevenueCat de test', () => {
  const offenders = [];
  for (const [profileName, profile] of Object.entries(eas?.build ?? {})) {
    for (const [name, value] of Object.entries(profile?.env ?? {})) {
      if (!/REVENUECAT/.test(name)) continue;
      if (typeof value !== 'string') continue;
      if (/^test[._-]|^teststore/i.test(value.trim())) offenders.push(`${profileName}:${name}`);
    }
  }
  assert.deepEqual(offenders, [], `chei de test în profilele EAS: ${offenders.join(', ')}`);

  // Cheia publică Google rămâne declarată în profilul de producție: un singur loc de
  // completat pentru owner.
  //
  // Ce verifică acest test ȘI ce NU verifică (corectat la cererea din audit, poziția A5):
  // - NU are voie să ceară cheia goală. Un astfel de test trecea exact atât timp cât
  //   magazinul era spart în producție și pica în momentul reparării (cheie reală pusă).
  // - Verifică ce se poate verifica fără secrete: câmpul există în profil, iar DACĂ are o
  //   valoare, aceea e o cheie de magazin utilizabilă (nu placeholder, nu Test Store).
  // - Cât timp câmpul e gol, livrarea e oprită de poarta de release (`npm run test:release`),
  //   care tratează cheia lipsă ca FAIL — vezi scripts/release-readiness.mjs.
  const productionEnv = eas?.build?.production?.env ?? {};
  assert.equal('EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY' in productionEnv, true);

  const productionKey = (productionEnv.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ?? '').trim();
  if (productionKey !== '') {
    assert.equal(
      isPlaceholder(productionKey),
      false,
      'profilul production livrează o cheie neutilizabilă (placeholder sau Test Store)',
    );
  }
});
