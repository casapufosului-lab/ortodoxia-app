/**
 * Teste pentru `plugins/with-google-services.js` și `app.config.js` (P2: FCM reproducibil la un build
 * de la zero).
 *
 * De ce așa: `expo prebuild` nu se rulează în depozitul de lucru (ar regenera `android/`, de care
 * depinde build-ul local), deci pluginul se verifică pe mostre reale de șablon Expo SDK 57 — aceleași
 * ancore pe care le vede prebuild-ul: `buildscript { … dependencies {` în `android/build.gradle` și
 * sfârșitul fișierului `android/app/build.gradle`.
 *
 * Fără fișiere de credențe pe disc: existența `google-services.json` se injectează în funcția de
 * rezolvare a căii.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const plugin = require(join(ROOT, 'plugins', 'with-google-services.js'));
const appConfigModule = require(join(ROOT, 'app.config.js'));
const appJson = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8'));

/** `android/build.gradle` așa cum iese din șablonul Expo SDK 57, FĂRĂ legarea google-services. */
const TEMPLATE_ROOT_GRADLE = `// Top-level build file where you can add configuration options common to all sub-projects/modules.

buildscript {
  repositories {
    google()
    mavenCentral()
  }
  dependencies {
    classpath('com.android.tools.build:gradle')
    classpath('com.facebook.react:react-native-gradle-plugin')
    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
  }
}

allprojects {
  repositories {
    google()
    mavenCentral()
    maven { url 'https://www.jitpack.io' }
  }
}

apply plugin: "expo-root-project"
apply plugin: "com.facebook.react.rootproject"
`;

/** `android/app/build.gradle` din șablon, tot FĂRĂ `apply plugin`-ul de FCM. */
const TEMPLATE_APP_GRADLE = `apply plugin: "com.android.application"
apply plugin: "org.jetbrains.kotlin.android"
apply plugin: "com.facebook.react"

android {
    namespace 'ro.orthodoxia.app'
    compileSdkVersion 36
}

dependencies {
    implementation("com.facebook.react:react-android")
}
`;

/** Numără aparițiile unui text (fără regex, ca `$` și `.` să nu conteze). */
function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

test('classpath-ul google-services intră în buildscript.dependencies, nu în allprojects (P2.1)', () => {
  const patched = plugin.patchRootBuildGradle(TEMPLATE_ROOT_GRADLE);

  assert.ok(patched.includes(plugin.CLASS_PATH_LINE), 'lipsește classpath-ul google-services');
  assert.equal(countOccurrences(patched, plugin.GOOGLE_SERVICES_COORDINATE), 1);

  const buildscriptAt = patched.indexOf('buildscript {');
  const allprojectsAt = patched.indexOf('allprojects {');
  const classpathAt = patched.indexOf(plugin.CLASS_PATH_LINE);
  assert.ok(classpathAt > buildscriptAt, 'classpath-ul trebuie să fie în blocul buildscript');
  assert.ok(classpathAt < allprojectsAt, 'classpath-ul nu are ce căuta în allprojects');

  // Restul fișierului rămâne neatins, linie cu linie: linia intră la sfârșitul blocului de dependențe.
  const expected = TEMPLATE_ROOT_GRADLE.replace(
    "    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n  }",
    `    classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')\n${plugin.CLASS_PATH_LINE}\n  }`,
  );
  assert.equal(patched, expected);
});

test('classpath-ul intră la sfârșitul blocului de dependențe, ca legarea manuală din android/ (P2.1)', () => {
  const patched = plugin.patchRootBuildGradle(TEMPLATE_ROOT_GRADLE);
  const dependenciesAt = patched.indexOf('  dependencies {');
  const dependenciesBlock = patched.slice(dependenciesAt, patched.indexOf('\n  }', dependenciesAt));
  assert.ok(
    dependenciesBlock.trimEnd().endsWith(plugin.CLASS_PATH_LINE.trim()),
    'ultima dependență din buildscript trebuie să fie google-services',
  );
});

test('patch-ul de pe android/build.gradle este idempotent (P2.1)', () => {
  const once = plugin.patchRootBuildGradle(TEMPLATE_ROOT_GRADLE);
  const twice = plugin.patchRootBuildGradle(once);
  assert.equal(twice, once);
  assert.equal(countOccurrences(twice, plugin.GOOGLE_SERVICES_COORDINATE), 1);
});

test('o legare google-services deja existentă nu se dublează (P2.1)', () => {
  const already = TEMPLATE_ROOT_GRADLE.replace(
    '  dependencies {\n',
    "  dependencies {\n    classpath('com.google.gms:google-services:4.4.0')\n",
  );
  const patched = plugin.patchRootBuildGradle(already);
  assert.equal(patched, already, 'un șablon mai nou nu trebuie modificat');
  assert.equal(countOccurrences(patched, 'com.google.gms:google-services'), 1);
});

test('un șablon de android/build.gradle necunoscut oprește prebuild-ul, nu trece tăcut (P2.1)', () => {
  assert.throws(
    () => plugin.patchRootBuildGradle('// nimic util aici\nallprojects { }\n'),
    /buildscript/,
  );
});

test('apply plugin-ul de FCM ajunge la sfârșitul android/app/build.gradle (P2.1)', () => {
  const patched = plugin.patchAppBuildGradle(TEMPLATE_APP_GRADLE);
  const applyLine = `apply plugin: '${plugin.GOOGLE_SERVICES_PLUGIN_ID}'`;

  assert.ok(patched.includes(applyLine), 'lipsește apply plugin pentru google-services');
  assert.equal(countOccurrences(patched, applyLine), 1);
  // Pluginul se aplică DUPĂ pluginul Android, deci după blocul `android { … }`.
  assert.ok(patched.indexOf(applyLine) > patched.indexOf('android {'));
  assert.ok(patched.trimEnd().endsWith(applyLine), 'ultima linie utilă este apply plugin');
  // Fisierul real din android/ are comentariul de mai jos (nu numeste id-ul), deci se verifica exact:
  assert.ok(patched.includes('// Firebase / FCM:'), 'comentariul care explica aplicarea pluginului');
});

test('patch-ul de pe android/app/build.gradle este idempotent (P2.1)', () => {
  const once = plugin.patchAppBuildGradle(TEMPLATE_APP_GRADLE);
  assert.equal(plugin.patchAppBuildGradle(once), once);
  assert.equal(countOccurrences(once, `apply plugin: '${plugin.GOOGLE_SERVICES_PLUGIN_ID}'`), 1);
});

test('un apply plugin scris altfel este recunoscut, nu dublat (P2.1)', () => {
  const variant = `${TEMPLATE_APP_GRADLE}\napply plugin: "com.google.gms.google-services"\n`;
  assert.equal(plugin.patchAppBuildGradle(variant), variant);
});

test('fișierele cu CRLF rămân cu CRLF după patch (P2.1, Windows)', () => {
  const crlfRoot = plugin.patchRootBuildGradle(TEMPLATE_ROOT_GRADLE.replace(/\n/g, '\r\n'));
  assert.ok(crlfRoot.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(crlfRoot), 'nu se amestecă terminatori de linie');

  const crlfApp = plugin.patchAppBuildGradle(TEMPLATE_APP_GRADLE.replace(/\n/g, '\r\n'));
  assert.ok(crlfApp.includes('\r\n'));
  assert.ok(!/[^\r]\n/.test(crlfApp));
});

test('app.json încarcă pluginul de google-services și păstrează googleServicesFile (P2.1)', () => {
  assert.ok(
    appJson.expo.plugins.includes('./plugins/with-google-services'),
    'fără linia din app.json, legarea Gradle nu se aplică la prebuild',
  );
  assert.equal(appJson.expo.android.googleServicesFile, './google-services.json');
});

test('calea din variabila de mediu are prioritate, dacă fișierul există (P2.2)', () => {
  const absoluteEnvPath = resolve('secrete-absoluta', 'google-services.json');
  const projectRoot = resolve('proiect-de-proba');
  const resolved = appConfigModule.resolveGoogleServicesFile({
    projectRoot,
    env: { GOOGLE_SERVICES_JSON_PATH: absoluteEnvPath },
    exists: (path) => path === absoluteEnvPath,
  });
  assert.equal(resolved, absoluteEnvPath);
});

test('o cale relativă din mediu se rezolvă față de rădăcina proiectului (P2.2)', () => {
  const resolved = appConfigModule.resolveGoogleServicesFile({
    projectRoot: resolve('proiect-de-proba'),
    env: { GOOGLE_SERVICES_JSON_PATH: 'secrete/google-services.json' },
    exists: () => true,
  });
  assert.equal(resolved, join(resolve('proiect-de-proba'), 'secrete', 'google-services.json'));
});

test('variabila de tip „file" de pe EAS (GOOGLE_SERVICES_JSON) este acceptată (P2.2)', () => {
  const easPath = resolve('eas-proba', 'google-services.json');
  const resolved = appConfigModule.resolveGoogleServicesFile({
    projectRoot: resolve('proiect-de-proba'),
    env: { GOOGLE_SERVICES_JSON: easPath },
    exists: (path) => path === easPath,
  });
  assert.equal(resolved, easPath);
});

test('o variabilă care arată spre un fișier lipsă nu produce o cale inventată (P2.2)', () => {
  const warn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(String(message));
  try {
    const resolved = appConfigModule.resolveGoogleServicesFile({
      projectRoot: resolve('proiect-de-proba'),
      env: { GOOGLE_SERVICES_JSON_PATH: join('lipsa', 'google-services.json') },
      exists: () => false,
    });
    assert.equal(resolved, appConfigModule.DEFAULT_GOOGLE_SERVICES_PATH);
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.length, 1, 'utilizatorul trebuie anunțat');
  assert.match(warnings[0], /nu există/);
});

test('fără variabile de mediu, rămâne calea declarată în app.json (P2.2)', () => {
  const resolved = appConfigModule.resolveGoogleServicesFile({ projectRoot: resolve('proiect-de-proba'), env: {} });
  assert.equal(resolved, appJson.expo.android.googleServicesFile);
});

test('configurarea dinamică păstrează restul app.json și schimbă doar calea (P2.2)', () => {
  const previous = process.env.GOOGLE_SERVICES_JSON_PATH;
  delete process.env.GOOGLE_SERVICES_JSON_PATH;
  try {
    const result = appConfigModule({ config: appJson.expo });
    assert.equal(result.name, appJson.expo.name);
    assert.equal(result.android.package, appJson.expo.android.package);
    assert.equal(result.android.versionCode, appJson.expo.android.versionCode);
    assert.deepEqual(result.plugins, appJson.expo.plugins);
  } finally {
    if (previous !== undefined) process.env.GOOGLE_SERVICES_JSON_PATH = previous;
  }
});
