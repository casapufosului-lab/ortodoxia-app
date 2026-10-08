#!/usr/bin/env node
/**
 * Dovada că verificarea cheii de magazin (poziţia B6 din audit) chiar cade.
 *
 * Un test care citeşte textul din scriptul de poartă poate trece şi atunci când poarta nu
 * verifică nimic. Aici se rulează POARTA REALĂ, pe o copie mutată a `eas.json`, şi se
 * verifică ieşirea ei — deci dovada e comportamentală, nu textuală.
 *
 * Ce dovedeşte:
 *   1. cheie goală în profilul production + `--release`  -> FAIL explicit + exit 1;
 *   2. aceeaşi cheie goală, mod normal (fără --release)  -> DEFERRED, exit 0 (nu blochează CI-ul de zi);
 *   3. cheie reală (`goog_…`) + `--release`              -> verificarea de cheie NU mai dă FAIL
 *      (deci poarta nu e „blocată pe roşu" şi nu poate fi trecută prin slăbire);
 *   4. fişierul real `eas.json` rămâne neatins (sha256 identic la început şi la sfârşit).
 *
 * `eas.json` real nu este nici măcar deschis pentru scriere: poarta citeşte copia din folderul
 * temporar, prin `ORTODOXIA_EAS_JSON` (override acceptat doar din folderul temporar).
 *
 * Rulare:  node scripts/prove-store-key-gate-fails.mjs
 * Ieşire:  0 = dovada a trecut, 1 = dovada a eşuat (şi spune care punct).
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const EAS = join(ROOT, 'eas.json');
const GATE = join(HERE, 'release-readiness.mjs');
const GOOGLE_KEY = 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY';

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function runGate(easPath, releaseMode) {
  const args = [GATE];
  if (releaseMode) args.push('--release');
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ORTODOXIA_EAS_JSON: easPath },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

const original = readFileSync(EAS, 'utf8');
const originalHash = sha256(original);
const tempDir = mkdtempSync(join(tmpdir(), 'ortodoxia-store-key-proof-'));

try {
  const originalProfile = JSON.parse(original);

  const withEmptyKey = JSON.parse(original);
  withEmptyKey.build.production.env[GOOGLE_KEY] = '';

  const withRealKey = JSON.parse(original);
  withRealKey.build.production.env[GOOGLE_KEY] = 'goog_proof_only_key_000';

  const emptyPath = join(tempDir, 'eas-empty.json');
  const realPath = join(tempDir, 'eas-real.json');
  writeFileSync(emptyPath, `${JSON.stringify(withEmptyKey, null, 2)}\n`, 'utf8');
  writeFileSync(realPath, `${JSON.stringify(withRealKey, null, 2)}\n`, 'utf8');

  // Sanity: mutaţia chiar schimbă ceva (altfel dovada ar fi goală).
  check(
    'mutarea de probă schimbă valoarea cheii Google',
    originalProfile.build.production.env[GOOGLE_KEY] !== withRealKey.build.production.env[GOOGLE_KEY],
    `azi: ${JSON.stringify(originalProfile.build.production.env[GOOGLE_KEY])}`,
  );

  const releaseEmpty = runGate(emptyPath, true);
  check(
    '1. cheie goală + --release -> FAIL „cannot sell anything"',
    releaseEmpty.status === 1 && /cannot sell anything: EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY/.test(releaseEmpty.output),
    `exit ${releaseEmpty.status}`,
  );

  const defaultEmpty = runGate(emptyPath, false);
  const releaseFailInDefault = /^FAIL\s+\[release\] the production profile cannot sell anything/m.test(defaultEmpty.output);
  check(
    '2. cheie goală, mod normal -> DEFERRED, nu FAIL (CI-ul de zi nu se blochează)',
    defaultEmpty.status === 0 && !releaseFailInDefault
      && /^DEFERRED \[release\] the production profile cannot sell anything: EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY/m.test(defaultEmpty.output),
    `exit ${defaultEmpty.status}`,
  );

  const releaseReal = runGate(realPath, true);
  check(
    '3. cheie reală + --release -> verificarea de cheie trece',
    !/cannot sell anything/.test(releaseReal.output) && /carries a usable store key \(Google Play\)/.test(releaseReal.output),
    `exit ${releaseReal.status}`,
  );

  // EAS env-ul de mai jos e evaluat fără profilurile din eas.json real: dovada nu are voie să pretindă
  // că poarta e verde în ansamblu, doar că verificarea de cheie nu mai e cea care cade.
  check(
    '3b. cheia reală nu face poarta verde în ansamblu (restul verificărilor se văd)',
    releaseReal.status === 1 && /RELEASE GATE: NOT READY/.test(releaseReal.output),
    `exit ${releaseReal.status}`,
  );

  const afterHash = sha256(readFileSync(EAS, 'utf8'));
  check('4. eas.json real e neatins (sha256 identic)', afterHash === originalHash, `${originalHash.slice(0, 12)}…`);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const failed = checks.filter((entry) => !entry.ok);
console.log('');
console.log(`DOVADA CHEIE DE MAGAZIN: ${failed.length === 0 ? 'OK' : 'EȘUATĂ'} — ${checks.length - failed.length}/${checks.length} puncte.`);
process.exit(failed.length === 0 ? 0 : 1);
