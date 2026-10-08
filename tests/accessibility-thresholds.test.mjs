/**
 * C8 — pragurile auditului de accesibilitate.
 *
 * Poziția C8 din audit spunea: „scripts/accessibility-audit.mjs:409 MIN_TOUCH = 44
 * (Google cere 48) și nu verifică iconițe ≥24 / buton de întoarcere ≥56 (regulile
 * 27/28). Fix: ridică la 48 + adaugă verificările. Verde: un control de 44px →
 * auditul pică."
 *
 * Testul de față apără exact acele trei lucruri, în trei feluri:
 *   1. citind constantele din sursă (48 / 24 / 56);
 *   2. rulând `--self-test`-ul auditului, care trebuie să acopere fiecare prag;
 *   3. cu un MUTANT: un exemplar al auditului cu pragul coborât înapoi la 44 trebuie
 *      să PICE la verificarea corespunzătoare — dacă nu pică, testul de față pică.
 *
 * Plus o poartă pe arborele livrat: `node scripts/accessibility-audit.mjs` fără
 * argumente trebuie să iasă 0 (nicio constatare), deci un control nou sub 48dp sau o
 * iconiță nouă sub 24 oprește suita.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'scripts', 'accessibility-audit.mjs');
const SOURCE = readFileSync(SCRIPT, 'utf8');

/** Runs the audit script and returns its exit status plus combined output. */
function runAudit(scriptPath, args = []) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath, ...args], { cwd: REPO, encoding: 'utf8' });
    return { status: 0, output: stdout };
  } catch (error) {
    return { status: error.status ?? 1, output: `${error.stdout ?? ''}${error.stderr ?? ''}` };
  }
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('C8: pragurile sunt cele cerute de Google și de regulile 27/28', () => {
  assert.match(SOURCE, /const MIN_TOUCH = 48;/, 'ținta minimă trebuie să fie 48dp');
  assert.match(SOURCE, /const MIN_ICON = 24;/, 'regula 27 cere iconițe de minim 24');
  assert.match(SOURCE, /const MIN_BACK = 56;/, 'regula 28 cere butonul de întoarcere de minim 56');
  assert.doesNotMatch(SOURCE, /MIN_TOUCH = 44;/);
});

test('C8: self-testul auditului trece și acoperă fiecare prag', () => {
  const { status, output } = runAudit(SCRIPT, ['--self-test']);
  assert.equal(status, 0, `self-testul a picat:\n${output}`);

  const checks = [
    'a 20pt icon is below rule 27',
    'a 24pt icon passes rule 27',
    'an icon with no declared size is reported',
    'a day cell with a number and a marker is not an icon',
    'a 40pt back control is below rule 28',
    'a 56pt back control passes rule 28',
    'a 44pt control is below the 48dp floor',
    'a 48pt control reaches the floor',
  ];
  for (const check of checks) {
    assert.match(output, new RegExp(`PASS  ${escapeRegExp(check)}`), `lipsește verificarea: ${check}`);
  }
});

test('C8: pragul coborât la 44 face self-testul să pice (mutant)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ortodoxia-a11y-'));
  const mutant = join(dir, 'accessibility-audit.mjs');
  const mutated = SOURCE.replace('const MIN_TOUCH = 48;', 'const MIN_TOUCH = 44;');
  assert.notEqual(mutated, SOURCE, 'mutantul trebuie să schimbe ceva');
  writeFileSync(mutant, mutated, 'utf8');

  const { status, output } = runAudit(mutant, ['--self-test']);
  assert.notEqual(status, 0, 'cu pragul la 44, self-testul trebuie să iasă cu eroare');
  // Exact verificarea de prag trebuie să cadă: la 44, un control de 44 nu mai e „sub prag".
  // (Verificarea „48 atinge pragul" rămâne verde și la 44 — 48 ≥ 44 — deci nu se cere.)
  assert.match(output, /FAIL  a 44pt control is below the 48dp floor/, 'trebuie să pice exact la pragul de țintă');
});

test('C8: arborele livrat nu are nicio constatare de accesibilitate', () => {
  const { status, output } = runAudit(SCRIPT);
  assert.equal(status, 0, `auditul găsește probleme:\n${output}`);
  assert.match(output, /0 finding\(s\)/);
});
