/**
 * Hardening nativ pentru Android, aplicat la FIECARE `expo prebuild`.
 *
 * DE CE EXISTĂ (pozițiile A9, A10, C1, C2, C3 din audit)
 * -----------------------------------------------------
 * Folderul `android/` este ignorat de git (`.gitignore:50`), deci orice modificare făcută manual
 * în `AndroidManifest.xml` sau în `app/build.gradle` dispare la prima regenerare — local sau pe
 * EAS. Tot ce s-a câștigat manual se pierdea la următorul build, iar un build EAS putea pleca cu
 * manifestul și semnarea din șablon. Pluginul mută modificările în configurația versionată
 * (`app.json` + acest fișier), ca prebuild să le reproducă identic.
 *
 * Punct cu punct:
 *   C1  iconița și culoarea de notificare — se configurează în `app.json`, la `expo-notifications`
 *       (pluginul oficial Expo scrie meta-datele `expo.modules.notifications.default_notification_*`).
 *   C2  scoate permisiunile de storage. Nicio parte a aplicației nu citește sau scrie în storage
 *       extern: zero referințe la `MediaLibrary`, `StorageAccessFramework`, `documentDirectory`,
 *       `cacheDirectory` sau `downloadAsync` în `src/` (verificat cu Select-String).
 *   C3  `android:usesCleartextTraffic="false"` — tot traficul aplicației este HTTPS.
 *   A9  semnarea de release NU mai poate cădea în keystore-ul de debug. Șablonul Expo SDK 57
 *       declară în `buildTypes.release` chiar `signingConfig signingConfigs.debug`; un AAB semnat
 *       așa este refuzat la upload, dar eroarea apare abia în consolă. Aici build-ul se oprește
 *       zgomotos dacă nu există un keystore real.
 *   A10 cele 16 permisiuni de badge aduse de `me.leolin:ShortcutBadger` (dependență tranzitivă a
 *       `expo-notifications`) rămân scoase din manifestul final.
 *
 * DE CE E ÎN SIGURANȚĂ PENTRU EAS
 * ------------------------------
 * Keystore-ul poate veni din două surse, verificate în ordine: variabilele de mediu
 * `ORTODOXIA_UPLOAD_*` (build local) sau proprietățile `android.injected.signing.*` (injectate de
 * EAS Build). Dacă niciuna nu există, build-ul de release se oprește — nu produce un artefact
 * semnat greșit. Un eșec zgomotos se vede în log; un AAB semnat cu cheia de debug se vede abia la
 * încărcarea în Play.
 *
 * IDEMPOTENȚĂ
 * -----------
 * `expo prebuild` fără `--clean` nu suprascrie fișierele native existente, deci modulele de mai jos
 * pot rula pe un proiect deja modificat. Fiecare pas recunoaște rezultatul deja aplicat și nu îl
 * dublează; dacă șablonul nu seamănă nici cu varianta originală, nici cu cea modificată, pluginul
 * aruncă o eroare (mai bine un prebuild oprit decât un build pe jumătate configurat).
 */
const {
  AndroidConfig,
  withAndroidManifest,
  withAppBuildGradle,
  withGradleProperties,
} = require('@expo/config-plugins');

/** Permisiuni de badge injectate de ShortcutBadger; aplicația nu apelează nicio API de badge. */
const BADGE_PERMISSIONS = [
  'android.permission.READ_APP_BADGE',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
];

/** Permisiuni de storage, fără niciun consumator în aplicație (vezi C2 în comentariul de sus). */
const STORAGE_PERMISSIONS = [
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];

/**
 * Permisiuni aduse de șablonul React Native pe care aplicația nu le folosește.
 * `SYSTEM_ALERT_WINDOW` ("draw over other apps") e declarată de șablon pentru overlay-ul de
 * dezvoltare; Play o verifică separat la review, iar aplicația nu desenează nimic peste alte
 * aplicații. Fără intrarea asta, `expo prebuild` o readuce în manifestul de release.
 */
const UNUSED_TEMPLATE_PERMISSIONS = [
  'android.permission.SYSTEM_ALERT_WINDOW',
];

const REMOVED_PERMISSIONS = [
  ...STORAGE_PERMISSIONS,
  ...BADGE_PERMISSIONS,
  ...UNUSED_TEMPLATE_PERMISSIONS,
];

// ─── Manifest ────────────────────────────────────────────────────────────────────────────────────

function withHardenedManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    manifest.$ = manifest.$ ?? {};
    // `tools:node="remove"` are nevoie de declararea namespace-ului pe elementul rădăcină.
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] ?? 'http://schemas.android.com/tools';

    const existing = manifest['uses-permission'] ?? [];
    const kept = [];
    const alreadyMarkedForRemoval = new Set();

    for (const entry of existing) {
      const name = entry?.$?.['android:name'];
      if (name && REMOVED_PERMISSIONS.includes(name)) {
        // Declarația locală iese din manifest; ce aduce o librărie se scoate cu `tools:node`.
        // Un marcaj existent se păstrează ca atare, ca rularea repetată să nu schimbe fișierul.
        if (entry?.$?.['tools:node'] === 'remove') {
          alreadyMarkedForRemoval.add(name);
          kept.push(entry);
        }
        continue;
      }
      kept.push(entry);
    }

    for (const name of REMOVED_PERMISSIONS) {
      if (alreadyMarkedForRemoval.has(name)) continue;
      kept.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
    manifest['uses-permission'] = kept;

    // C3: fără trafic în clar.
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    application.$['android:usesCleartextTraffic'] = 'false';

    return config;
  });
}

// ─── Gradle: semnare de release ──────────────────────────────────────────────────────────────────

const TEMPLATE_DEBUG_SIGNING_CONFIG = [
  '        debug {',
  "            storeFile file('debug.keystore')",
  "            storePassword 'android'",
  "            keyAlias 'androiddebugkey'",
  "            keyPassword 'android'",
  '        }',
  '',
].join('\n');

const RELEASE_SIGNING_CONFIG = [
  '        // A9: keystore-ul de upload. Cheia și parolele vin din mediu (build local) sau din',
  "        // proprietățile `android.injected.signing.*` injectate de EAS Build. Nimic nu se",
  '        // comite în repo.',
  '        release {',
  "            def uploadStoreFile = System.getenv('ORTODOXIA_UPLOAD_STORE_FILE')",
  "            def injectedStoreFile = findProperty('android.injected.signing.store.file')",
  '            if (uploadStoreFile) {',
  '                storeFile file(uploadStoreFile)',
  "                storePassword System.getenv('ORTODOXIA_UPLOAD_STORE_PASSWORD')",
  "                keyAlias System.getenv('ORTODOXIA_UPLOAD_KEY_ALIAS')",
  "                keyPassword System.getenv('ORTODOXIA_UPLOAD_KEY_PASSWORD')",
  '            } else if (injectedStoreFile) {',
  '                storeFile file(injectedStoreFile)',
  "                storePassword findProperty('android.injected.signing.store.password')",
  "                keyAlias findProperty('android.injected.signing.key.alias')",
  "                keyPassword findProperty('android.injected.signing.key.password')",
  '            }',
  '        }',
  '',
].join('\n');

const TEMPLATE_RELEASE_LINE = '            signingConfig signingConfigs.debug\n';

const HARDENED_RELEASE_BLOCK = [
  '            // A9: NICIODATĂ keystore-ul de debug. Șablonul Expo pune aici',
  '            // `signingConfig signingConfigs.debug`, iar un AAB semnat așa este refuzat la',
  '            // upload. Preferăm un build oprit, cu mesaj clar, în locul unui artefact inutil.',
  '            // Verificarea se face doar când se cere un build de release: altfel și un `gradlew',
  '            // installDebug` ar avea nevoie de keystore-ul de upload.',
  "            def hasUploadKeystore = System.getenv('ORTODOXIA_UPLOAD_STORE_FILE') || findProperty('android.injected.signing.store.file')",
  '            def requestedTasks = gradle.startParameter.taskNames.collect { it.toLowerCase() }',
  "            def debugOnly = !requestedTasks.isEmpty() && requestedTasks.every { it.contains('debug') }",
  '            def nonBuilding = requestedTasks.isEmpty() || requestedTasks.every { name ->',
  "                ['tasks', 'projects', 'help', 'properties', 'dependencies', 'signingreport', 'clean', 'cleanbuildcache'].any { name == it || name.endsWith(':' + it) }",
  '            }',
  '            if (!hasUploadKeystore && !debugOnly && !nonBuilding) {',
  '                throw new GradleException(',
  '                    "Build de release fără keystore. Setează ORTODOXIA_UPLOAD_STORE_FILE, " +',
  '                    "ORTODOXIA_UPLOAD_STORE_PASSWORD, ORTODOXIA_UPLOAD_KEY_ALIAS și " +',
  '                    "ORTODOXIA_UPLOAD_KEY_PASSWORD (sau lasă EAS să injecteze " +',
  '                    "android.injected.signing.*). Vezi docs/ANDROID-HARDENING.md."',
  '                )',
  '            }',
  '            signingConfig hasUploadKeystore ? signingConfigs.release : signingConfigs.debug',
].join('\n');

const HARDENING_MARKER = 'A9: NICIODATĂ keystore-ul de debug';

/**
 * Patch pe `android/app/build.gradle`, așa cum iese el din șablonul Expo SDK 57.
 *
 * Aruncă dacă nici varianta originală, nici cea modificată nu e recunoscută: un șablon nou trebuie
 * citit de un om, nu presupus.
 *
 * Fișierele generate pe Windows au terminatori CRLF, iar ancorele de mai jos sunt scrise cu LF:
 * potrivirea se face pe text normalizat, iar la ieșire se reface stilul original.
 */
function patchAppBuildGradle(rawContents) {
  const usesCrlf = rawContents.includes('\r\n');
  const contents = usesCrlf ? rawContents.replace(/\r\n/g, '\n') : rawContents;
  if (contents.includes(HARDENING_MARKER)) return rawContents;

  const signingConfigsAnchor = contents.indexOf(TEMPLATE_DEBUG_SIGNING_CONFIG);
  if (signingConfigsAnchor === -1) {
    throw new Error(
      'plugins/with-android-hardening: blocul `signingConfigs.debug` din șablonul Expo nu a fost ' +
        'găsit în android/app/build.gradle. Șablonul s-a schimbat — verifică manual semnarea.',
    );
  }
  let patched =
    contents.slice(0, signingConfigsAnchor) +
    TEMPLATE_DEBUG_SIGNING_CONFIG +
    RELEASE_SIGNING_CONFIG +
    contents.slice(signingConfigsAnchor + TEMPLATE_DEBUG_SIGNING_CONFIG.length);

  // Ancorele se caută DOAR în interiorul `buildTypes`: `signingConfigs` are și el un bloc
  // `release {`, iar varianta `debug` are aceeași linie de semnare. Fără restricția asta, patch-ul
  // nimerea varianta de debug (a prins-o testul).
  const buildTypesAnchor = patched.indexOf('    buildTypes {');
  const releaseBlockAnchor = buildTypesAnchor === -1 ? -1 : patched.indexOf('        release {', buildTypesAnchor);
  const releaseLine = releaseBlockAnchor === -1 ? -1 : patched.indexOf(TEMPLATE_RELEASE_LINE, releaseBlockAnchor);
  if (buildTypesAnchor === -1 || releaseBlockAnchor === -1 || releaseLine === -1) {
    throw new Error(
      'plugins/with-android-hardening: nu am găsit `buildTypes.release` cu linia ' +
        '`signingConfig signingConfigs.debug` în android/app/build.gradle.',
    );
  }
  patched =
    patched.slice(0, releaseLine) +
    `${HARDENED_RELEASE_BLOCK}\n` +
    patched.slice(releaseLine + TEMPLATE_RELEASE_LINE.length);

  return usesCrlf ? patched.replace(/\n/g, '\r\n') : patched;
}

/**
 * Proprietăți de build pentru release (C21).
 *
 * Șablonul Expo SDK 57 citește ambele praguri din `android/gradle.properties`:
 *   `app/build.gradle:69`   `def enableMinifyInReleaseBuilds = (findProperty('android.enableMinifyInReleaseBuilds') ?: false).toBoolean()`
 *   `app/build.gradle:153`  `def enableShrinkResources = findProperty('android.enableShrinkResourcesInReleaseBuilds') ?: 'false'`
 *   `app/build.gradle:154-155` `shrinkResources ...` / `minifyEnabled enableMinifyInReleaseBuilds`
 *
 * Fără ele, release-ul iese neofuscat și cu tot arborele de resurse, deși `proguard-rules.pro` există.
 * Se scriu în configurația versionată, nu direct în `android/` (care e Git-ignored): altfel fiecare
 * `expo prebuild` le-ar șterge, iar pe EAS build-ul ar pleca din nou cu ele pe false.
 *
 * `shrinkResources` cere `minifyEnabled`; cele două merg împreună și se verifică împreună (test de fum
 * pe emulator, vezi docs/ANDROID-HARDENING.md).
 */
const RELEASE_BUILD_PROPERTIES = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

/**
 * Scrie proprietățile de release în lista parsată din `android/gradle.properties`.
 *
 * Idempotent: dacă proprietatea există, îi schimbă valoarea în loc să adauge o a doua intrare (un
 * `gradle.properties` cu aceeași cheie de două ori este o eroare tăcută de configurare).
 */
function applyReleaseBuildProperties(properties) {
  const result = properties.map((item) => ({ ...item }));
  for (const [key, value] of Object.entries(RELEASE_BUILD_PROPERTIES)) {
    const existing = result.findIndex((item) => item.type === 'property' && item.key === key);
    if (existing === -1) {
      result.push({ type: 'property', key, value });
    } else {
      result[existing] = { type: 'property', key, value };
    }
  }
  return result;
}

function withHardenedGradleProperties(config) {
  return withGradleProperties(config, (config) => {
    config.modResults = applyReleaseBuildProperties(config.modResults);
    return config;
  });
}

function withHardenedGradle(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = patchAppBuildGradle(config.modResults.contents);
    return config;
  });
}

module.exports = function withAndroidHardening(config) {
  config = withHardenedManifest(config);
  config = withHardenedGradle(config);
  config = withHardenedGradleProperties(config);
  return config;
};

module.exports.BADGE_PERMISSIONS = BADGE_PERMISSIONS;
module.exports.STORAGE_PERMISSIONS = STORAGE_PERMISSIONS;
module.exports.REMOVED_PERMISSIONS = REMOVED_PERMISSIONS;
module.exports.TEMPLATE_DEBUG_SIGNING_CONFIG = TEMPLATE_DEBUG_SIGNING_CONFIG;
module.exports.patchAppBuildGradle = patchAppBuildGradle;
module.exports.HARDENING_MARKER = HARDENING_MARKER;
module.exports.RELEASE_BUILD_PROPERTIES = RELEASE_BUILD_PROPERTIES;
module.exports.applyReleaseBuildProperties = applyReleaseBuildProperties;
