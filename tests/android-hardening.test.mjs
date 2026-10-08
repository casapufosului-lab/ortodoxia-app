/**
 * Teste pentru `plugins/with-android-hardening.js` — pozițiile A9, A10, C1, C2, C3 din audit.
 *
 * Ce apără: folderul `android/` este ignorat de git, deci hardening-ul nativ există doar dacă
 * pluginul îl rescrie la fiecare `expo prebuild`. Testele rulează modulele pluginului pe mostre
 * reale (manifestul ieșit din prebuild și șablonul Expo SDK 57 pentru `app/build.gradle`,
 * copiat din https://raw.githubusercontent.com/expo/expo/sdk-57/templates/expo-template-bare-minimum/android/app/build.gradle),
 * apoi verifică rezultatul și `app.json`, care este sursa de adevăr versionată.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = require(join(ROOT, 'plugins', 'with-android-hardening.js'));
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));

/** Fragmentul de semnare din șablonul Expo SDK 57, neatins. */
const TEMPLATE_GRADLE_SNIPPET = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            // Caution! In production, you need to generate your own keystore file.
            // see https://reactnative.dev/docs/signed-apk-android.
            signingConfig signingConfigs.debug
            def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'
        }
    }
}
`;

/** Manifest așa cum iese din prebuild, cu permisiunile de storage adăugate de librării. */
const BASE_MANIFEST = {
  manifest: {
    $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
    'uses-permission': [
      { $: { 'android:name': 'android.permission.INTERNET' } },
      { $: { 'android:name': 'android.permission.RECORD_AUDIO' } },
      { $: { 'android:name': 'android.permission.READ_EXTERNAL_STORAGE' } },
      { $: { 'android:name': 'android.permission.WRITE_EXTERNAL_STORAGE' } },
    ],
    application: [{ $: { 'android:name': '.MainApplication', 'android:usesCleartextTraffic': 'true' } }],
  },
};

/**
 * Rulează modul `android.manifest` înregistrat de plugin, așa cum îl rulează prebuild-ul: modul
 * primește `modResults` (manifestul parsat) și îl întoarce modificat. `nextMod` este identitatea,
 * exact ca atunci când pluginul este singurul care atinge manifestul.
 */
async function runManifestMod() {
  const config = plugin({});
  const mod = config.mods.android.manifest;
  assert.equal(typeof mod, 'function', 'pluginul trebuie să înregistreze modul android.manifest');
  const result = await mod({
    modResults: structuredClone(BASE_MANIFEST),
    modRequest: { platform: 'android', mod: 'manifest', projectRoot: ROOT, nextMod: (config) => config },
  });
  return result.modResults.manifest;
}

test('permisiunile de storage ies din manifest, cu tools:node="remove"', async () => {
  const manifest = await runManifestMod();
  // Declarațiile se scot din manifest, iar ce aduce o librărie se elimină la merge prin
  // `tools:node="remove"` — deci numele rămâne în fișier, dar cu marcajul de eliminare.
  const granted = manifest['uses-permission']
    .filter((entry) => entry.$['tools:node'] !== 'remove')
    .map((entry) => entry.$['android:name']);

  for (const permission of plugin.STORAGE_PERMISSIONS) {
    assert.equal(granted.includes(permission), false, `${permission} nu are ce căuta între permisiuni`);
  }
  const marked = manifest['uses-permission']
    .filter((entry) => entry.$['tools:node'] === 'remove')
    .map((entry) => entry.$['android:name']);
  for (const permission of plugin.STORAGE_PERMISSIONS) {
    assert.ok(marked.includes(permission), `${permission} trebuie eliminată la merge`);
  }
});

test('cele 16 permisiuni de badge sunt marcate pentru eliminare (A10)', async () => {
  const manifest = await runManifestMod();
  const removals = manifest['uses-permission'].filter((entry) => entry.$['tools:node'] === 'remove');
  const removed = removals.map((entry) => entry.$['android:name']);

  assert.equal(plugin.BADGE_PERMISSIONS.length, 16);
  for (const permission of plugin.BADGE_PERMISSIONS) {
    assert.ok(removed.includes(permission), `${permission} trebuie eliminată din manifestul final`);
  }
  // Namespace-ul `tools` trebuie declarat, altfel `tools:node` este ignorat la merge.
  assert.equal(manifest.$['xmlns:tools'], 'http://schemas.android.com/tools');
});

test('traficul în clar este oprit (C3)', async () => {
  const manifest = await runManifestMod();
  assert.equal(manifest.application[0].$['android:usesCleartextTraffic'], 'false');
});

test('permisiunile cerute de aplicație rămân în manifest', async () => {
  const manifest = await runManifestMod();
  const names = manifest['uses-permission'].map((entry) => entry.$['android:name']);
  assert.ok(names.includes('android.permission.INTERNET'));
  assert.ok(names.includes('android.permission.RECORD_AUDIO'));
});

test('modul de manifest este idempotent (prebuild fără --clean)', async () => {
  const first = await runManifestMod();
  const mod = plugin({}).mods.android.manifest;
  const second = (
    await mod({
      modResults: { manifest: structuredClone(first) },
      modRequest: { platform: 'android', mod: 'manifest', projectRoot: ROOT, nextMod: (config) => config },
    })
  ).modResults.manifest;
  assert.deepEqual(second, first);
});

test('semnarea de release nu mai poate cădea în keystore-ul de debug (A9)', () => {
  const patched = plugin.patchAppBuildGradle(TEMPLATE_GRADLE_SNIPPET);

  // Atenție la ancoră: `signingConfigs` are și el un bloc `release {`, aflat ÎNAINTE de `buildTypes`.
  const buildTypesAt = patched.indexOf('    buildTypes {');
  const releaseAt = patched.indexOf('        release {', buildTypesAt);
  const releaseBlock = patched.slice(releaseAt);
  // Linia de atribuire, nu textul din comentariul care o explică.
  assert.equal(
    /^\s*signingConfig signingConfigs\.debug\s*$/m.test(releaseBlock),
    false,
    'șablonul folosea chiar cheia de debug pentru release',
  );
  assert.match(releaseBlock, /def hasUploadKeystore = System\.getenv\('ORTODOXIA_UPLOAD_STORE_FILE'\) \|\| findProperty\('android\.injected\.signing\.store\.file'\)/);
  assert.match(releaseBlock, /signingConfig hasUploadKeystore \? signingConfigs\.release : signingConfigs\.debug/);
  assert.match(releaseBlock, /throw new GradleException/);

  // Verificarea se face doar pentru build-uri de release: un `gradlew installDebug` nu are nevoie
  // de keystore-ul de upload, iar `gradlew tasks` nu construiește nimic.
  assert.match(releaseBlock, /def debugOnly = /);
  assert.match(releaseBlock, /def nonBuilding = /);
  assert.match(releaseBlock, /if \(!hasUploadKeystore && !debugOnly && !nonBuilding\) \{/);

  // Semnarea de debug rămâne disponibilă pentru varianta `debug`.
  const debugBuildType = patched.slice(buildTypesAt, releaseAt);
  assert.match(debugBuildType, /signingConfig signingConfigs\.debug/);
  assert.ok(
    patched.includes("storeFile file('debug.keystore')"),
    'debug.keystore rămâne folosit de varianta debug',
  );

  // Blocul de release citește ambele surse de keystore, local și EAS.
  assert.match(patched, /storeFile file\(uploadStoreFile\)/);
  assert.match(patched, /storeFile file\(injectedStoreFile\)/);
});

test('patch-ul de gradle este idempotent', () => {
  const once = plugin.patchAppBuildGradle(TEMPLATE_GRADLE_SNIPPET);
  assert.equal(plugin.patchAppBuildGradle(once), once);
});

test('un șablon necunoscut oprește prebuild-ul, nu trece tăcut', () => {
  assert.throws(
    () => plugin.patchAppBuildGradle('android {\n    buildTypes {\n    }\n}\n'),
    /șablonul Expo nu a fost găsit|nu a fost găsită/,
  );
});

test('app.json încarcă pluginul de hardening', () => {
  const plugins = appJson.expo.plugins;
  assert.ok(
    plugins.includes('./plugins/with-android-hardening'),
    'fără linia din app.json, hardening-ul nu se aplică la prebuild',
  );
});

test('app.json configurează iconița, culoarea și stratul monocrom (C1, C25)', () => {
  const notifications = appJson.expo.plugins.find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-notifications',
  );
  assert.ok(notifications, 'expo-notifications trebuie configurat cu opțiuni, nu doar încărcat');
  assert.equal(notifications[1].icon, './assets/images/android-icon-monochrome.png');
  assert.match(notifications[1].color, /^#[0-9A-Fa-f]{6}$/);

  assert.equal(
    appJson.expo.android.adaptiveIcon.monochromeImage,
    './assets/images/android-icon-monochrome.png',
  );
});

test('iconița folosită la notificări există și este o siluetă cu transparență', () => {
  const icon = readFileSync(join(ROOT, 'assets', 'images', 'android-icon-monochrome.png'));
  // Semnătura PNG + chunk IHDR: dimensiune și tip de culoare (6 = RGBA).
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(icon.readUInt32BE(16), 432);
  assert.equal(icon.readUInt32BE(20), 432);
  assert.equal(icon.readUInt8(25), 6, 'iconița de notificare are nevoie de canal alfa');
});
