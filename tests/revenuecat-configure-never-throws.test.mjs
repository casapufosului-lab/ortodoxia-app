/**
 * Poziția B10 din audit: `configureRevenueCat()` nu are voie să arunce niciodată.
 *
 * De ce contează: funcția este apelată din `src/app/_layout.tsx`, adică exact în calea de
 * pornire a aplicației. `Purchases.setLogLevel()` și `Purchases.configure()` ajung în SDK-ul
 * nativ și pot arunca sincron (cheie respinsă, BillingClient neinițializat, SDK configurat deja).
 * Un throw neprins acolo oprește aplicația la pornire — exact simptomul „aplicația se închide"
 * văzut cu o cheie de Test Store.
 *
 * Testele rulează MODULUL REAL (`src/lib/revenuecat.ts`, transpilat și evaluat cu stub-uri de
 * `react-native` / `react-native-purchases`), nu o copie a logicii: dacă cineva scoate try/catch-ul
 * sau îl mută greșit, testele cad.
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
const source = readFileSync(join(root, 'src/lib/revenuecat.ts'), 'utf8');
const layout = readFileSync(join(root, 'src/app/_layout.tsx'), 'utf8');

/**
 * Evaluează modulul real cu un SDK de magazin controlat de test.
 *
 * @param {object} options
 * @param {'android'|'ios'|'web'} options.platform
 * @param {boolean} options.dev
 * @param {Record<string, string>} options.env cheile publice văzute de modul
 * @param {object} options.purchases stub-ul SDK-ului (configure/setLogLevel/isConfigured)
 */
function loadRealModule({ platform = 'android', dev = true, env = {}, purchases = {} } = {}) {
  const calls = { configure: [], setLogLevel: [], warn: [] };

  const sdk = {
    isConfigured: false,
    setLogLevel(level) {
      calls.setLogLevel.push(level);
      if (purchases.setLogLevelThrows) throw new Error('native setLogLevel failed');
    },
    configure(options) {
      calls.configure.push(options);
      if (purchases.configureThrows) throw new Error('native configure failed');
      sdk.isConfigured = true;
    },
  };

  const javascript = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;

  const moduleObject = { exports: {} };
  const context = vm.createContext({
    module: moduleObject,
    exports: moduleObject.exports,
    console: { warn: (...args) => calls.warn.push(args), log() {}, error() {} },
    process: { env: { ...env } },
    __DEV__: dev,
    require: (id) => {
      if (id === 'react-native') return { Platform: { OS: platform } };
      if (id === 'react-native-purchases') {
        return { __esModule: true, default: sdk, LOG_LEVEL: { DEBUG: 'debug' }, PURCHASES_ERROR_CODE: {} };
      }
      throw new Error(`modul neașteptat cerut de revenuecat.ts: ${id}`);
    },
  });

  vm.runInContext(javascript, context, { filename: 'revenuecat.cjs' });

  const exports = moduleObject.exports;
  assert.equal(typeof exports.configureRevenueCat, 'function', 'configureRevenueCat trebuie exportată');
  assert.equal(typeof exports.isRevenueCatConfigured, 'function', 'isRevenueCatConfigured trebuie exportată');
  return { exports, calls };
}

const REAL_GOOGLE_KEY = 'goog_AbCdEfGhIjKlMnOpQrStUvWx';
const REAL_APPLE_KEY = 'appl_AbCdEfGhIjKlMnOpQrStUvWx';

test('un configure() care aruncă nu iese din funcție și lasă magazinul indisponibil', () => {
  const { exports, calls } = loadRealModule({
    env: { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: REAL_GOOGLE_KEY },
    purchases: { configureThrows: true },
  });

  assert.doesNotThrow(() => exports.configureRevenueCat(), 'configureRevenueCat nu are voie să arunce');
  assert.equal(calls.configure.length, 1, 'a încercat configurarea');
  assert.equal(
    exports.isRevenueCatConfigured(),
    false,
    'după un eșec, magazinul trebuie să rămână „indisponibil", nu „configurat"',
  );
});

test('un setLogLevel() care aruncă nu împiedică configurarea magazinului', () => {
  const { exports, calls } = loadRealModule({
    env: { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: REAL_GOOGLE_KEY },
    purchases: { setLogLevelThrows: true },
    dev: true,
  });

  assert.doesNotThrow(() => exports.configureRevenueCat());
  assert.equal(calls.setLogLevel.length, 1, 's-a încercat pornirea logării de debug');
  assert.equal(calls.configure.length, 1, 'eșecul de logging nu are voie să blocheze configurarea');
  assert.equal(exports.isRevenueCatConfigured(), true);
});

test('configurarea reușită: cheia de platformă ajunge la SDK, o singură dată', () => {
  const { exports, calls } = loadRealModule({
    platform: 'android',
    env: { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: REAL_GOOGLE_KEY, EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: REAL_APPLE_KEY },
  });

  exports.configureRevenueCat();
  exports.configureRevenueCat();

  // Obiectele vin din alt „realm" (vm), deci se compară valoarea, nu prototipul.
  assert.equal(calls.configure.length, 1);
  assert.equal(calls.configure[0].apiKey, REAL_GOOGLE_KEY);
  assert.equal(exports.isRevenueCatConfigured(), true);
});

test('pe iOS folosește cheia App Store, nu cea de Google', () => {
  const { exports, calls } = loadRealModule({
    platform: 'ios',
    env: { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: REAL_GOOGLE_KEY, EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY: REAL_APPLE_KEY },
  });

  exports.configureRevenueCat();
  assert.equal(calls.configure.length, 1);
  assert.equal(calls.configure[0].apiKey, REAL_APPLE_KEY);
});

test('o cheie lipsă, goală sau de test nu ajunge niciodată în SDK', () => {
  const cases = [
    {},
    { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: '' },
    { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: '   ' },
    { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: 'your_google_api_key_here' },
    { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: 'test_hVIDVoaJiBadAmRvNXnXpadrmFl' },
  ];

  for (const env of cases) {
    const { exports, calls } = loadRealModule({ env });
    assert.doesNotThrow(() => exports.configureRevenueCat());
    assert.deepEqual(calls.configure, [], `cheia ${JSON.stringify(env)} nu are voie să ajungă în SDK`);
    assert.equal(exports.isRevenueCatConfigured(), false);
  }
});

test('pe web nu se atinge SDK-ul de magazin', () => {
  const { exports, calls } = loadRealModule({
    platform: 'web',
    env: { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: REAL_GOOGLE_KEY },
  });

  assert.doesNotThrow(() => exports.configureRevenueCat());
  assert.deepEqual(calls.configure, []);
  assert.deepEqual(calls.setLogLevel, []);
});

test('nici în build de release un eșec al SDK-ului nu are voie să iasă din funcție', () => {
  const { exports, calls } = loadRealModule({
    dev: false,
    env: { EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: REAL_GOOGLE_KEY },
    purchases: { configureThrows: true },
  });

  assert.doesNotThrow(() => exports.configureRevenueCat());
  assert.deepEqual(calls.setLogLevel, [], 'logging-ul de debug nu se pornește în release');
  assert.equal(exports.isRevenueCatConfigured(), false);
});

test('calea de pornire cheamă funcția într-un try/catch (apărare în adâncime)', () => {
  const call = layout.indexOf('configureRevenueCat()');
  assert.ok(call >= 0, '_layout.tsx trebuie să configureze RevenueCat la pornire');
  assert.ok(layout.slice(0, call).lastIndexOf('try {') >= 0, 'apelul trebuie să fie în interiorul unui try');
  assert.ok(layout.indexOf('catch', call) > call, 'apelul trebuie să aibă un catch după el');
});
