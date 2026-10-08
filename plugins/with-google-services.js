/**
 * FCM (Firebase Cloud Messaging) care supraviețuiește unui build de la zero (`expo prebuild` / EAS).
 *
 * DE CE EXISTĂ
 * ------------
 * `app.json` cere `android.googleServicesFile`, dar fișierul `google-services.json` NU poate sta în
 * rădăcina depozitului: scannerul de credențe din `scripts/release-readiness.mjs` (§9, `SECRET_PATTERNS`)
 * găsește în el cheia `AIza…` și oprește garda cu „possible Google API key". De aceea fișierul stă în
 * afara depozitului, iar `android/` este Git-ignorat (`.gitignore`) și regenerat de `expo prebuild`.
 *
 * Legarea Gradle de care depinde canalul de notificări — classpath-ul `com.google.gms:google-services`
 * din `android/build.gradle` și `apply plugin: 'com.google.gms.google-services'` în
 * `android/app/build.gradle` — fusese făcută manual, direct în `android/`. La primul build de la zero
 * dispărea, împreună cu FCM. Pluginul mută legarea în configurația versionată, ca prebuild să o
 * reproducă identic, pe orice mașină.
 *
 * Ce NU face pluginul: nu generează și nu copiază `google-services.json`. Calea fișierului se rezolvă
 * în `app.config.js`, care citește `GOOGLE_SERVICES_JSON_PATH` (sau variabila de tip „file" de pe EAS,
 * `GOOGLE_SERVICES_JSON`). Aici se scrie doar legarea Gradle.
 *
 * IDEMPOTENȚĂ
 * -----------
 * `expo prebuild` fără `--clean` nu suprascrie fișierele native existente, deci modulele de mai jos pot
 * rula pe un proiect deja modificat (Windows + Linux, CRLF sau LF). Fiecare pas recunoaște rezultatul
 * deja aplicat — al nostru sau al unui șablon mai nou — și nu îl dublează (`apply plugin` de două ori
 * este o eroare de configurare Gradle). Dacă șablonul Expo nu seamănă cu niciunul dintre ele, pluginul
 * aruncă: mai bine un prebuild oprit și citit de un om decât un build fără FCM.
 */
const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

/** Versiunea folosită de legarea manuală verificată în build-ul de release (4.4.2). */
const GOOGLE_SERVICES_VERSION = '4.4.2';
const GOOGLE_SERVICES_COORDINATE = 'com.google.gms:google-services';
const GOOGLE_SERVICES_PLUGIN_ID = 'com.google.gms.google-services';

const CLASS_PATH_LINE = `    classpath('${GOOGLE_SERVICES_COORDINATE}:${GOOGLE_SERVICES_VERSION}')`;
/** Ancora din șablonul Expo SDK 57: `buildscript { … dependencies {`. */
const BUILDSCRIPT_ANCHOR = 'buildscript {';
const DEPENDENCIES_ANCHOR = '  dependencies {';
/** Închiderea blocului `dependencies`, la aceeași indentare cu el. */
const DEPENDENCIES_CLOSE_ANCHOR = '\n  }';

/** Linia de `apply plugin`, precedată de comentariul care explică de ce e acolo. */
const APPLY_BLOCK = [
  '// Firebase / FCM: proceseaza android/app/google-services.json (notificari push).',
  `apply plugin: '${GOOGLE_SERVICES_PLUGIN_ID}'`,
  '',
].join('\n');

const APPLY_PATTERN = new RegExp(
  `^\\s*apply plugin:\\s*['"]${GOOGLE_SERVICES_PLUGIN_ID.replace(/\./g, '\\.')}['"]\\s*$`,
  'm',
);

/** Reface stilul original de terminare a liniilor după ce patch-ul a lucrat pe text normalizat la LF. */
function restoreLineEndings(patched, usesCrlf) {
  return usesCrlf ? patched.replace(/\n/g, '\r\n') : patched;
}

/**
 * Adaugă classpath-ul google-services în `buildscript.dependencies` din `android/build.gradle`.
 *
 * Căutarea se face DOAR după `buildscript {`: `allprojects` are și el blocuri, iar un `dependencies {`
 * găsit acolo ar pune classpath-ul în locul greșit. Linia intră la SFÂRȘITUL blocului de dependențe —
 * exact locul în care stătea legarea manuală verificată de build-ul de release. Dacă vreo versiune de
 * google-services există deja (șablon mai nou), nu se adaugă a doua: dublura rupe configurarea Gradle.
 */
function patchRootBuildGradle(rawContents) {
  const usesCrlf = rawContents.includes('\r\n');
  const contents = usesCrlf ? rawContents.replace(/\r\n/g, '\n') : rawContents;
  if (contents.includes(GOOGLE_SERVICES_COORDINATE)) return rawContents;

  const buildscriptAt = contents.indexOf(BUILDSCRIPT_ANCHOR);
  const dependenciesAt = buildscriptAt === -1 ? -1 : contents.indexOf(DEPENDENCIES_ANCHOR, buildscriptAt);
  const dependenciesCloseAt =
    dependenciesAt === -1 ? -1 : contents.indexOf(DEPENDENCIES_CLOSE_ANCHOR, dependenciesAt);
  if (buildscriptAt === -1 || dependenciesAt === -1 || dependenciesCloseAt === -1) {
    throw new Error(
      'plugins/with-google-services: blocul `buildscript { … dependencies { … } }` din șablonul Expo nu a ' +
        'fost găsit în android/build.gradle. Șablonul s-a schimbat — verifică manual legarea google-services.',
    );
  }

  // `+ 1` sare peste `\n`, ca linia nouă să stea înaintea acoladei de închidere, nu după ea.
  const insertAt = dependenciesCloseAt + 1;
  return restoreLineEndings(
    `${contents.slice(0, insertAt)}${CLASS_PATH_LINE}\n${contents.slice(insertAt)}`,
    usesCrlf,
  );
}

/**
 * Adaugă `apply plugin: 'com.google.gms.google-services'` la sfârșitul `android/app/build.gradle`.
 *
 * Sfârșitul fișierului este locul corect: pluginul trebuie aplicat DUPĂ pluginul Android din același
 * fișier, iar `expo prebuild` scrie șablonul de sus în jos.
 */
function patchAppBuildGradle(rawContents) {
  const usesCrlf = rawContents.includes('\r\n');
  const contents = usesCrlf ? rawContents.replace(/\r\n/g, '\n') : rawContents;
  if (APPLY_PATTERN.test(contents)) return rawContents;

  const trimmed = contents.replace(/\n+$/, '');
  return restoreLineEndings(`${trimmed}\n\n${APPLY_BLOCK}`, usesCrlf);
}

function withGoogleServicesGradle(config) {
  return withProjectBuildGradle(config, (config) => {
    config.modResults.contents = patchRootBuildGradle(config.modResults.contents);
    return config;
  });
}

function withGoogleServicesApplyPlugin(config) {
  return withAppBuildGradle(config, (config) => {
    config.modResults.contents = patchAppBuildGradle(config.modResults.contents);
    return config;
  });
}

module.exports = function withGoogleServices(config) {
  config = withGoogleServicesGradle(config);
  config = withGoogleServicesApplyPlugin(config);
  return config;
};

module.exports.GOOGLE_SERVICES_VERSION = GOOGLE_SERVICES_VERSION;
module.exports.GOOGLE_SERVICES_COORDINATE = GOOGLE_SERVICES_COORDINATE;
module.exports.GOOGLE_SERVICES_PLUGIN_ID = GOOGLE_SERVICES_PLUGIN_ID;
module.exports.CLASS_PATH_LINE = CLASS_PATH_LINE;
module.exports.patchRootBuildGradle = patchRootBuildGradle;
module.exports.patchAppBuildGradle = patchAppBuildGradle;
