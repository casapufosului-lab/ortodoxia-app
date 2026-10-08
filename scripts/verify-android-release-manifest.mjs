/**
 * C23 — verifică manifestul MERGED al unui build de release, ca A9 (permisiunile de badge)
 * și A10 (cleartext) să nu mai poată scăpa neobservate până la magazin.
 *
 * De ce un script separat de CI-ul obișnuit: manifestul merged se produce doar de un build
 * Android (Gradle), care cere SDK, JDK și ~10 minute — prea scump pentru fiecare push.
 * `.github/workflows/ci.yml` îl cheamă doar la `workflow_dispatch`, cu `android_artifact`.
 *
 * Ce verifică, pe textul manifestului (nu pe binarul AXML):
 *   1. nicio permisiune din lista interzisă nu apare — acestea sunt exact permisiunile
 *      ShortcutBadger/storage pe care `plugins/with-android-hardening.js` le scoate cu
 *      `tools:node="remove"`; dacă `android/` se pierde la un prebuild fără plugin (B8),
 *      ele REAPAR în manifestul merged, fără niciun martor în repo;
 *   2. `android:usesCleartextTraffic="false"` e prezent (altfel traficul în clar e permis);
 *   3. aplicația nu e `android:debuggable="true"`.
 *
 * Fail-closed: dacă nu găsește niciun manifest, iese cu 2 și spune de ce (un gate care nu
 * are ce citi nu e un gate verde).
 *
 * Utilizare:
 *   node scripts/verify-android-release-manifest.mjs <cale-manifest-sau-director>
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Permisiunile pe care build-ul de release NU are voie să le declare. */
export const FORBIDDEN_PERMISSIONS = [
  'android.permission.READ_APP_BADGE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'com.anddoes.launcher.permission.UPDATE_COUNT',
  'com.htc.launcher.permission.READ_SETTINGS',
  'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.huawei.android.launcher.permission.CHANGE_BADGE',
  'com.huawei.android.launcher.permission.READ_SETTINGS',
  'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.oppo.launcher.permission.READ_SETTINGS',
  'com.oppo.launcher.permission.WRITE_SETTINGS',
  'com.sec.android.provider.badge.permission.READ',
  'com.sec.android.provider.badge.permission.WRITE',
  'com.sonyericsson.home.permission.BROADCAST_BADGE',
  'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'me.everything.badger.permission.BADGE_COUNT_READ',
  'me.everything.badger.permission.BADGE_COUNT_WRITE',
];

/**
 * Verifică textul unui manifest merged. Întoarce lista de probleme (goală = verde).
 * Pură, ca să poată fi hrănită și cu manifeste stricate, în teste.
 */
export function auditMergedManifest(xml) {
  const problems = [];

  for (const permission of FORBIDDEN_PERMISSIONS) {
    if (xml.includes(`"${permission}"`)) {
      problems.push(
        `permisiune interzisă în manifestul de release: ${permission} `
        + '(pluginul de hardening a fost pierdut la prebuild?)',
      );
    }
  }

  if (!/android:usesCleartextTraffic="false"/.test(xml)) {
    problems.push('lipsește android:usesCleartextTraffic="false" (traficul în clar ar fi permis)');
  }

  if (/android:debuggable="true"/.test(xml)) {
    problems.push('android:debuggable="true" într-un manifest de release');
  }

  if (!/<application\b/.test(xml)) {
    problems.push('nu pare un manifest Android: lipsește <application>');
  }

  return problems;
}

/** Găsește manifestele dintr-o cale (fișier sau director), preferându-le pe cele de release. */
export function findManifests(inputPath) {
  const stat = statSync(inputPath);
  if (stat.isFile()) return [inputPath];

  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const child = statSync(abs);
      if (child.isDirectory()) {
        walk(abs);
        continue;
      }
      if (name === 'AndroidManifest.xml') found.push(abs);
    }
  };
  walk(inputPath);

  const release = found.filter((p) => /release/i.test(p));
  return release.length > 0 ? release : found;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('FAIL: lipsește calea către manifest (fișier sau director).');
    process.exit(2);
  }

  let manifests;
  let targetIsFile = false;
  try {
    targetIsFile = statSync(target).isFile();
    manifests = findManifests(target);
  } catch (error) {
    console.error(`FAIL: nu pot citi ${target} (${error.message}). Gate neexecutat.`);
    process.exit(2);
  }

  if (manifests.length === 0) {
    console.error(`FAIL: niciun AndroidManifest.xml sub ${target}. Un build care nu a produs manifest nu e verificat.`);
    process.exit(2);
  }

  const failures = [];
  for (const manifest of manifests) {
    const problems = auditMergedManifest(readFileSync(manifest, 'utf8'));
    const label = targetIsFile ? target : relative(process.cwd(), manifest);
    if (problems.length === 0) {
      console.log(`PASS [manifest] ${label}: fără permisiuni interzise, cleartext oprit, fără debuggable`);
      continue;
    }
    for (const problem of problems) failures.push(`${label}: ${problem}`);
    console.log(`FAIL [manifest] ${label}: ${problems.length} problemă(e)`);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.log(`  - ${failure}`);
    console.log(`MANIFEST GATE: ${failures.length} FAIL — buildul nu are voie în magazin.`);
    process.exit(1);
  }

  console.log(`MANIFEST GATE: OK — ${manifests.length} manifest(e) verificate.`);
}

// Rulează doar când e chemat direct (poate fi importat în teste fără efecte).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
