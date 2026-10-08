/**
 * C23 — CI-ul nu producea și nu verifica niciun artefact de release, deci A9 (permisiunile de badge
 * care reapar dacă pluginul de hardening se pierde la prebuild) și A10 (cleartextul repermis) nu
 * puteau fi prinse automat.
 *
 * Testul apără două lucruri:
 *   1. jobul `android-artifact` din `.github/workflows/ci.yml` — există, e DOAR manual
 *      (`workflow_dispatch` + `android_artifact`), produce manifestul merged și nu cere nicio
 *      credențială (nu semnează, nu urcă);
 *   2. scriptul de gardă `scripts/verify-android-release-manifest.mjs` — chiar pică pe un manifest
 *      cu probleme și pică ÎNCHIS când nu are ce citi (un gate fără subiect nu e verde).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse as parseYaml } from 'yaml';

import { FORBIDDEN_PERMISSIONS, auditMergedManifest } from '../scripts/verify-android-release-manifest.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const WORKFLOW = join(REPO, '.github', 'workflows', 'ci.yml');
const CHECKER = join(REPO, 'scripts', 'verify-android-release-manifest.mjs');

/** Manifest merged curat: ce trebuie să iasă din build-ul de release. */
const CLEAN_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.RECORD_AUDIO"/>
  <application android:name=".MainApplication" android:usesCleartextTraffic="false">
    <activity android:name=".MainActivity"/>
  </application>
</manifest>
`;

/** Manifest de dinainte de hardening: permisiunile de badge, fără niciun `tools:node="remove"`. */
const UNHARDENED_MANIFEST = CLEAN_MANIFEST.replace(
  '  <application',
  '  <uses-permission android:name="com.sec.android.provider.badge.permission.READ"/>\n  <application',
);

function workflow() {
  return parseYaml(readFileSync(WORKFLOW, 'utf8'));
}

/** Scrie manifestele date într-un director temporar și întoarce calea lui. */
function tempManifestDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'manifest-gate-'));
  for (const [rel, contents] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, contents, 'utf8');
  }
  return dir;
}

/** Rulează verificatorul și întoarce { status, output } fără să arunce pe exit != 0. */
function runChecker(target) {
  try {
    const stdout = execFileSync(process.execPath, [CHECKER, target], { cwd: REPO, encoding: 'utf8' });
    return { status: 0, output: stdout };
  } catch (error) {
    return { status: error.status, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

test('jobul de artefact e DOAR manual și nu cere nicio credențială', () => {
  const jobs = workflow().jobs;
  const job = jobs['android-artifact'];
  assert.ok(job, 'lipsește jobul android-artifact din ci.yml');

  const guard = String(job.if ?? '');
  assert.match(guard, /workflow_dispatch/, 'jobul trebuie să fie condiționat de workflow_dispatch');
  assert.match(guard, /inputs\.android_artifact/, 'jobul trebuie să fie condiționat de intrarea android_artifact');

  const inputs = workflow().on.workflow_dispatch.inputs;
  assert.equal(inputs.android_artifact.default, false, 'intrarea android_artifact trebuie să fie oprită implicit');

  const asText = JSON.stringify(job);
  assert.doesNotMatch(asText, /secrets\./, 'jobul de manifest nu are voie să depindă de vreun secret');
  assert.doesNotMatch(asText.toLowerCase(), /upload-google-play|eas build|eas submit/,
    'jobul verifică un manifest, nu semnează și nu urcă (artefactul de magazin rămâne la owner)');
});

test('jobul de artefact produce manifestul merged și îl dă verificatorului', () => {
  const steps = workflow().jobs['android-artifact'].steps;
  const text = JSON.stringify(steps);

  assert.match(text, /expo prebuild/, 'jobul trebuie să regenereze proiectul nativ, ca la EAS');
  assert.match(text, /processReleaseManifest/, 'jobul trebuie să producă manifestul MERGED de release');
  assert.match(text, /verify-android-release-manifest\.mjs/, 'jobul trebuie să ruleze verificatorul de manifest');
});

test('CI-ul obișnuit rămâne neatins: rulează pe push, fără condiții ascunse', () => {
  const doc = workflow();
  assert.ok(doc.on.push, 'CI-ul trebuie să ruleze în continuare pe push');
  assert.ok(doc.on.pull_request !== undefined, 'CI-ul trebuie să ruleze în continuare pe pull_request');

  const verify = doc.jobs.verify;
  assert.ok(verify, 'lipsește jobul verify');
  assert.equal(verify.if, undefined, 'jobul verify nu are voie să devină condiționat');

  const text = JSON.stringify(verify.steps);
  for (const command of ['npm run typecheck', 'npm run test:release', 'npm test']) {
    assert.ok(text.includes(command), `jobul verify a pierdut pasul: ${command}`);
  }
  assert.equal(Object.keys(doc.jobs).length, 2, 'CI-ul are exact două joburi: verify + android-artifact');
});

test('verificatorul trece pe un manifest merged curat', () => {
  const dir = tempManifestDir({ 'app/build/intermediates/merged_manifests/release/AndroidManifest.xml': CLEAN_MANIFEST });
  const { status, output } = runChecker(dir);

  assert.equal(status, 0, `un manifest curat trebuie să treacă:\n${output}`);
  assert.match(output, /MANIFEST GATE: OK/);
});

test('verificatorul pică atunci când reapare o permisiune scoasă de hardening (A9)', () => {
  const dir = tempManifestDir({ 'release/AndroidManifest.xml': UNHARDENED_MANIFEST });
  const { status, output } = runChecker(dir);

  assert.equal(status, 1, `manifestul fără hardening trebuie să pice:\n${output}`);
  assert.match(output, /com\.sec\.android\.provider\.badge\.permission\.READ/);
  assert.match(output, /MANIFEST GATE: 1 FAIL/);
});

test('verificatorul pică atunci când cleartextul e repermis (A10)', () => {
  const relaxed = CLEAN_MANIFEST.replace('android:usesCleartextTraffic="false"', 'android:usesCleartextTraffic="true"');
  const dir = tempManifestDir({ 'release/AndroidManifest.xml': relaxed });
  const { status, output } = runChecker(dir);

  assert.equal(status, 1, `cleartextul permis trebuie să pice:\n${output}`);
  assert.match(output, /usesCleartextTraffic/);
});

test('verificatorul pică ÎNCHIS când nu are ce citi', () => {
  const empty = runChecker(mkdtempSync(join(tmpdir(), 'manifest-gate-gol-')));
  assert.equal(empty.status, 2, `un director fără manifest trebuie să iasă cu 2:\n${empty.output}`);

  const missing = runChecker(join(tmpdir(), 'nu-exista-acest-manifest.xml'));
  assert.equal(missing.status, 2, `o cale inexistentă trebuie să iasă cu 2:\n${missing.output}`);
});

test('din mai multe manifeste, verificatorul îl alege pe cel de release', () => {
  const dir = tempManifestDir({
    'debug/AndroidManifest.xml': UNHARDENED_MANIFEST,
    'release/AndroidManifest.xml': CLEAN_MANIFEST,
  });
  const { status, output } = runChecker(dir);

  assert.equal(status, 0, `manifestul de debug nu are ce căuta în verdict:\n${output}`);
  assert.match(output, /release/);
});

test('lista interzisă acoperă exact ce scoate pluginul de hardening (altfel gatele se despart)', () => {
  const plugin = require(join(REPO, 'plugins', 'with-android-hardening.js'));
  const removed = [
    ...plugin.BADGE_PERMISSIONS,
    ...plugin.STORAGE_PERMISSIONS,
    ...(plugin.REMOVED_PERMISSIONS ?? []),
  ];

  assert.ok(removed.length >= 18, `pluginul scoate ${removed.length} permisiuni — lista de mai jos e prea scurtă`);
  for (const permission of new Set(removed)) {
    assert.ok(
      FORBIDDEN_PERMISSIONS.includes(permission),
      `pluginul scoate ${permission}, dar verificatorul de manifest nu îl caută — adaugă-l în FORBIDDEN_PERMISSIONS`,
    );
  }
});

test('auditul prinde forma de dinainte de hardening și nu se încrede în textul cu remove', () => {
  // Un manifest care încă are marcajele `tools:node="remove"` NU e un manifest merged: dacă
  // verificatorul le-ar accepta, gate-ul ar trece pe sursă în loc de produs.
  const withRemoveMarkers = UNHARDENED_MANIFEST.replace(
    'android:name="com.sec.android.provider.badge.permission.READ"',
    'android:name="com.sec.android.provider.badge.permission.READ" tools:node="remove"',
  );
  const problems = auditMergedManifest(withRemoveMarkers);
  assert.ok(problems.length >= 1, 'un manifest cu permisiunea de badge (chiar și cu remove) nu e curat');
  assert.match(problems.join('\n'), /permisiune interzisă/);
});

test('verificatorul se plânge și dacă textul nu e un manifest', () => {
  const problems = auditMergedManifest('<!doctype html><html></html>');
  assert.match(problems.join('\n'), /lipsește <application>/);
});
