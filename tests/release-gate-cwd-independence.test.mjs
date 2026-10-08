/**
 * Poarta de release trebuie să dea același verdict indiferent din ce director e rulată.
 *
 * Defectul real, măsurat pe 08.10.2026: `checkContentReadiness()` căuta migrările cu
 * `existsSync('supabase/migrations')` — o cale **relativă la directorul de lucru**. Rulată din
 * altă parte (ex. din folderul de lucru al agentului), poarta nu vedea nicio migrare de conținut
 * zilnic și raporta un FAIL fals: „daily_content covers only 0 day(s) of 365". Depozitul are
 * 365 de zile distincte (2026-01-01 … 2026-12-31) în 4745 de rânduri.
 *
 * Testul verifică două lucruri, amândouă capabile să pice:
 *  1. comportamental — poarta, rulată cu `cwd` într-un director străin, raportează 365 de zile;
 *  2. structural — în `checkContentReadiness()` nu mai există nicio accesare de fișier ancorată
 *     în directorul curent (fără `join(ROOT, …)`), verificat pe un eșantion-mutant care REPRODuce
 *     defectul (dovada că detectorul poate pica).
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = join(REPO, 'scripts', 'release-readiness.mjs');

/**
 * Extrage corpul funcției `checkContentReadiness` din sursa porții.
 * @param {string} source
 * @returns {string}
 */
function contentReadinessBody(source) {
  const start = source.indexOf('function checkContentReadiness()');
  assert.notEqual(start, -1, 'checkContentReadiness() nu mai există în scripts/release-readiness.mjs');
  const end = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, end === -1 ? source.length : end);
}

/**
 * Adevărat dacă toate accesările de fișiere din corp sunt ancorate în ROOT.
 * @param {string} body
 * @returns {boolean}
 */
function fileAccessIsRootAnchored(body) {
  const calls = body.matchAll(/\b(existsSync|readdirSync|statSync)\(([^)]*)\)/g);
  for (const [, , args] of calls) {
    if (!args.includes('ROOT')) return false;
  }
  return true;
}

test('poarta de release: accesările de fișiere sunt ancorate în ROOT, nu în directorul curent', () => {
  const body = contentReadinessBody(readFileSync(GATE, 'utf8'));
  assert.equal(
    fileAccessIsRootAnchored(body),
    true,
    'checkContentReadiness() accesează fișiere față de directorul din care e rulată poarta',
  );

  // Eșantion-mutant: exact forma de dinainte de reparație. Detectorul TREBUIE să o respingă,
  // altfel testul de mai sus nu dovedește nimic.
  const before = [
    "  const seedFiles = existsSync(migrationsDir)",
    "    ? readdirSync(migrationsDir).filter((name) => /daily_content/i.test(name))",
    '    : [];',
  ].join('\n');
  assert.equal(
    fileAccessIsRootAnchored(before),
    false,
    'detectorul nu recunoaște forma defectă — testul nu poate pica',
  );
});

test('poarta de release: rulată din alt director, acoperirea conținutului zilnic rămâne 365 de zile', () => {
  const run = spawnSync(process.execPath, [GATE], {
    cwd: tmpdir(),
    encoding: 'utf8',
    timeout: 240_000,
  });
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  assert.ok(output.length > 0, 'poarta nu a produs nicio ieșire');
  assert.doesNotMatch(output, /daily_content covers only 0 day\(s\)/);
  assert.match(output, /daily_content covers 365 day\(s\)/);
});
