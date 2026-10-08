/**
 * C5 (registru, mediu) — `babel-plugin-react-compiler` trebuie declarat in `package.json`.
 *
 * DE CE
 * -----
 * `app.json` are `experiments.reactCompiler: true`, iar plugin-ul exista in `node_modules`
 * doar pentru ca `babel-preset-expo@57.0.9` il cere (`^1.0.0`). Nu era declarat ca dependenta
 * directa: daca preset-ul isi schimba lista (sau dispare dedup-ul), build-ul pierde plugin-ul
 * tacut, desi configuratia aplicatiei il cere. Declaratia oficiala s-a facut cu
 * `npx expo install babel-plugin-react-compiler` (acordul ownerului pentru `package.json`
 * + lockfile).
 *
 * CE VERIFICA TESTUL
 * ------------------
 *  1. `auditReactCompilerDeclaration` accepta configuratia reala si pica pe mutatiile care
 *     reintroduc problema (declaratie lipsa, interval gol, interval care nu acopera versiunea
 *     instalata);
 *  2. declaratia reala exista si acopera exact versiunea din `node_modules`;
 *  3. `package-lock.json` e de acord cu `package.json` si cu `node_modules` — o singura copie.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (relPath) => JSON.parse(readFileSync(join(REPO, relPath), 'utf8'));

const PLUGIN = 'babel-plugin-react-compiler';
const NODE_MODULES_ENTRY = `node_modules/${PLUGIN}`;

/** `^1.0.0`, `~1.0.0` sau `1.0.0` — suficient pentru intervalele folosite in proiect. */
function satisfies(version, range) {
  const toParts = (value) => value.trim().replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10));
  const match = String(range ?? '').trim().match(/^(?:\^|~)?\s*v?(\d+)\.(\d+)\.(\d+)/);
  if (!/^\d+\.\d+\.\d+/.test(String(version ?? '').trim()) || !match) return false;
  const [major, minor, patch] = toParts(version);
  const [, rMajor, rMinor, rPatch] = match.map((value, index) => (index === 0 ? value : Number.parseInt(value, 10)));
  const operator = String(range).trim()[0];

  if (operator === '^') {
    if (rMajor === 0) return major === 0 && minor === rMinor && patch >= rPatch;
    return major === rMajor && (minor > rMinor || (minor === rMinor && patch >= rPatch));
  }
  if (operator === '~') {
    return major === rMajor && minor === rMinor && patch >= rPatch;
  }
  return major === rMajor && minor === rMinor && patch === rPatch;
}

/**
 * Verifica declaratia plugin-ului React Compiler. Returneaza lista de probleme
 * (goala = totul e in regula).
 */
export function auditReactCompilerDeclaration({ pkg, app, installedVersion }) {
  const problems = [];
  const experiments = app?.expo?.experiments ?? {};
  const range = pkg?.dependencies?.[PLUGIN] ?? pkg?.devDependencies?.[PLUGIN];

  if (experiments.reactCompiler !== true) {
    // Compilatorul nu e activat: nu cerem declaratia (testul nu e un pass fortat).
    return problems;
  }

  if (range === undefined || range === null) {
    problems.push(`${PLUGIN} nu e declarat in package.json, desi experiments.reactCompiler este true`);
    return problems;
  }
  if (String(range).trim().length === 0) {
    problems.push(`${PLUGIN} e declarat cu interval gol`);
    return problems;
  }
  if (!existsSync(join(REPO, NODE_MODULES_ENTRY))) {
    problems.push(`${PLUGIN} nu e instalat in node_modules`);
    return problems;
  }
  if (!satisfies(installedVersion, range)) {
    problems.push(`versiunea instalata ${installedVersion} nu satisface intervalul declarat ${range}`);
  }
  return problems;
}

test('C5: plugin-ul React Compiler este declarat si acopera versiunea instalata', () => {
  const pkg = readJson('package.json');
  const app = readJson('app.json');
  const installedVersion = readJson(`${NODE_MODULES_ENTRY}/package.json`).version;

  assert.deepEqual(auditReactCompilerDeclaration({ pkg, app, installedVersion }), []);
  assert.equal(app.expo.experiments.reactCompiler, true, 'premisa: compilatorul e activat');
  assert.equal(typeof (pkg.dependencies?.[PLUGIN] ?? pkg.devDependencies?.[PLUGIN]), 'string');
  assert.equal(installedVersion, '1.0.0');
});

test('C5: auditorul pica pe declaratia lipsa, goala sau prea ingusta', () => {
  const pkg = readJson('package.json');
  const app = readJson('app.json');
  const installedVersion = readJson(`${NODE_MODULES_ENTRY}/package.json`).version;
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const faraDeclaratie = clone(pkg);
  delete faraDeclaratie.dependencies[PLUGIN];
  delete faraDeclaratie.devDependencies?.[PLUGIN];
  assert.ok(
    auditReactCompilerDeclaration({ pkg: faraDeclaratie, app, installedVersion }).length > 0,
    'declaratia lipsa trebuie respinsa',
  );

  const intervalGol = clone(pkg);
  intervalGol.dependencies[PLUGIN] = '';
  assert.ok(
    auditReactCompilerDeclaration({ pkg: intervalGol, app, installedVersion }).length > 0,
    'intervalul gol trebuie respins',
  );

  const intervalIngust = clone(pkg);
  intervalIngust.dependencies[PLUGIN] = '^2.0.0';
  assert.ok(
    auditReactCompilerDeclaration({ pkg: intervalIngust, app, installedVersion }).length > 0,
    'un interval care nu acopera versiunea instalata trebuie respins',
  );

  // Daca experimentul e oprit, auditorul nu inventeaza o problema.
  const faraExperiment = clone(app);
  delete faraExperiment.expo.experiments.reactCompiler;
  assert.deepEqual(auditReactCompilerDeclaration({ pkg: faraDeclaratie, app: faraExperiment, installedVersion }), []);
});

test('C5: package-lock.json e de acord cu package.json si cu node_modules (o singura copie)', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  const installedVersion = readJson(`${NODE_MODULES_ENTRY}/package.json`).version;

  const declaredRange = pkg.dependencies[PLUGIN];
  assert.equal(lock.packages[''].dependencies[PLUGIN], declaredRange, 'lockfile-ul trebuie sa aiba acelasi interval');
  assert.equal(lock.packages[NODE_MODULES_ENTRY].version, installedVersion, 'lockfile si node_modules trebuie sa fie de acord');

  // O singura copie fizica in arbore (dedup): nicio versiune imbricata sub alt pachet.
  const nested = Object.keys(lock.packages).filter((key) => key.endsWith(NODE_MODULES_ENTRY));
  assert.deepEqual(nested, [NODE_MODULES_ENTRY], 'nu are voie sa existe o a doua copie imbricata');

  // Preset-ul Expo cere acelasi interval: altfel npm ar putea instala doua copii.
  const preset = readJson('node_modules/babel-preset-expo/package.json');
  assert.equal(preset.dependencies[PLUGIN], declaredRange);
});
