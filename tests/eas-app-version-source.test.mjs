/**
 * C4 (registru, mediu) — `eas.json` trebuie sa declare explicit sursa versiunii de build.
 *
 * DE CE
 * -----
 * `eas.json` avea doar `cli.version` (`>= 13.0.0`), fara `appVersionSource`. Cand sursa nu e
 * declarata, EAS CLI decide singur (comportamentul depinde de versiunea CLI-ului), iar
 * `autoIncrement: true` din profilul `production` poate sa nu aiba ce sa incrementeze —
 * doua build-uri pot revendica acelasi `versionCode`, iar Play respinge al doilea upload.
 * Documentatia EAS (app version management) recomanda sursa `remote` impreuna cu
 * `autoIncrement`: serverul tine versiunea, iar prima versiune remote se initializeaza din
 * proiect (1 -> 2 pentru primul build remote).
 *
 * CE VERIFICA TESTUL
 * ------------------
 *  1. `auditEasConfig` accepta configuratia reala si poate pica pe fiecare din mutatiile care
 *     reintroduc problema (lipsa sursei, sursa necunoscuta, `autoIncrement` scos);
 *  2. configuratia reala din `eas.json` trece auditorul;
 *  3. `app.json` are un `android.versionCode` de la care sursa remote sa se initializeze.
 *
 * NOTA (neverificat): criteriul de VERDE din audit — `eas build:version:sync` — nu poate fi
 * rulat aici: EAS CLI nu e instalat in proiect (nu exista in `package.json`) si comanda cere
 * sesiunea EAS a ownerului. Ce se poate verifica offline e verificat mai jos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (name) => JSON.parse(readFileSync(join(REPO, name), 'utf8'));

/**
 * Verifica configuratia de versionare din eas.json. Returneaza lista de probleme
 * (goala = configuratia e explicita si coerenta).
 */
export function auditEasConfig(eas) {
  const problems = [];
  const cli = eas?.cli ?? {};
  const source = cli.appVersionSource;

  if (source === undefined || source === null || source === '') {
    problems.push('lipseste `cli.appVersionSource`: EAS CLI decide singur de unde ia versiunea');
  } else if (source !== 'remote' && source !== 'local') {
    problems.push(`` + `cli.appVersionSource necunoscut: ${JSON.stringify(source)}`);
  }

  if (typeof cli.version !== 'string' || cli.version.trim().length === 0) {
    problems.push('lipseste `cli.version`: nu se fixeaza un minim de EAS CLI');
  }

  const production = eas?.build?.production ?? {};
  if (production.autoIncrement !== true) {
    problems.push('`build.production.autoIncrement` nu este `true`: doua build-uri pot lua acelasi versionCode');
  }

  return problems;
}

test('C4: eas.json declara explicit sursa versiunii (remote) + autoIncrement pe productie', () => {
  const eas = readJson('eas.json');
  assert.deepEqual(auditEasConfig(eas), []);
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.autoIncrement, true);
});

test('C4: auditorul pica pe mutatiile care reintroduc problema', () => {
  const real = readJson('eas.json');

  const faraSursa = JSON.parse(JSON.stringify(real));
  delete faraSursa.cli.appVersionSource;
  assert.ok(auditEasConfig(faraSursa).length > 0, 'lipsa appVersionSource trebuie respinsa');

  const sursaGoala = JSON.parse(JSON.stringify(real));
  sursaGoala.cli.appVersionSource = '';
  assert.ok(auditEasConfig(sursaGoala).length > 0, 'sursa goala trebuie respinsa');

  const sursaNecunoscuta = JSON.parse(JSON.stringify(real));
  sursaNecunoscuta.cli.appVersionSource = 'automat';
  assert.ok(auditEasConfig(sursaNecunoscuta).length > 0, 'sursa necunoscuta trebuie respinsa');

  const faraIncrement = JSON.parse(JSON.stringify(real));
  delete faraIncrement.build.production.autoIncrement;
  assert.ok(auditEasConfig(faraIncrement).length > 0, 'lipsa autoIncrement pe productie trebuie respinsa');

  const faraCli = JSON.parse(JSON.stringify(real));
  delete faraCli.cli.version;
  assert.ok(auditEasConfig(faraCli).length > 0, 'lipsa minimului de CLI trebuie respinsa');

  // Sanity: mutatiile chiar schimba obiectul (altfel testul de mai sus nu ar putea pica).
  assert.notEqual(JSON.stringify(faraSursa), JSON.stringify(real));
});

test('C4: app.json are un versionCode de la care sursa remote porneste', () => {
  const app = readJson('app.json');
  const versionCode = app?.expo?.android?.versionCode;
  assert.equal(typeof versionCode, 'number');
  assert.ok(versionCode >= 1, 'versionCode trebuie sa fie cel putin 1');
  assert.equal(typeof app?.expo?.version, 'string');
});
