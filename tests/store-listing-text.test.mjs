/**
 * Teste pentru textele listării de magazin (poziția A3 din audit).
 *
 * Ce apără: Play Console refuză salvarea peste limitele lui — titlu 30 de caractere,
 * descriere scurtă 80, descriere completă 4000. Kitul de trimitere avea titlul de 33 și
 * descrierea scurtă de 82, deci listarea nu se putea publica așa cum era scrisă în repo.
 *
 * Testul citește chiar documentul din `docs/`, ca textul livrat și textul verificat să fie
 * unul singur.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Normalizat la LF: pe Windows fișierul poate avea CRLF, iar `[^\n]*` ar înghiți `\r` și ar
// face potrivirea liniilor de cod să depindă de sistemul de operare.
const KIT = readFileSync(join(ROOT, 'docs', 'STORE_SUBMISSION_KIT.md'), 'utf8').replace(/\r\n/g, '\n');

/** Numără caracterele așa cum le numără magazinul (puncte de cod, nu octeți UTF-8). */
const length = (value) => [...value].length;

test('titlul listării intră în limita de 30 de caractere a Play', () => {
  const match = KIT.match(/\*\*Titlu\*\* \(max (\d+) caractere\): `([^`]+)`/);
  assert.ok(match, 'kitul de trimitere nu mai declară un titlu de listare');
  const [, statedLimit, title] = match;
  assert.equal(Number(statedLimit), 30, 'limita reală Play pentru titlu este 30');
  assert.ok(length(title) <= 30, `titlul „${title}" are ${length(title)} caractere, peste 30`);
});

test('descrierea scurtă intră în limita de 80 de caractere', () => {
  const match = KIT.match(/\*\*Descriere scurtă\*\* \(max (\d+) caractere\):\s*\n`([^`]+)`/);
  assert.ok(match, 'kitul de trimitere nu mai declară o descriere scurtă');
  const [, statedLimit, description] = match;
  assert.equal(Number(statedLimit), 80, 'limita reală Play pentru descrierea scurtă este 80');
  assert.ok(
    length(description) <= 80,
    `descrierea scurtă are ${length(description)} caractere, peste 80`,
  );
});

test('descrierea scurtă spune că asistentul este AI (cerință de transparență)', () => {
  const match = KIT.match(/\*\*Descriere scurtă\*\* \(max \d+ caractere\):\s*\n`([^`]+)`/);
  assert.ok(match);
  assert.match(match[1], /AI/, 'listarea trebuie să spună că asistentul e AI');
});

test('descrierea completă intră în limita de 4000 de caractere', () => {
  const match = KIT.match(/\*\*Descriere completă\*\*[^\n]*\n+```\n([\s\S]*?)\n```/);
  assert.ok(match, 'kitul de trimitere nu mai are descrierea completă între liniile de cod');
  const description = match[1];
  assert.ok(description.trim().length > 0);
  assert.ok(
    length(description) <= 4000,
    `descrierea completă are ${length(description)} caractere, peste 4000`,
  );
});

test('titlul și descrierea nu promit funcții care nu există încă', () => {
  // Notificările sunt promise explicit în descrierea completă, iar auditul le-a marcat ca
  // nefiabile la lansare (lipsesc google-services.json și pornirea cron-ului). Cât timp
  // promisiunea rămâne în text, verificarea de release trebuie să o poată prinde.
  const fullDescription = KIT.match(/\*\*Descriere completă\*\*[^\n]*\n+```\n([\s\S]*?)\n```/)?.[1] ?? '';
  if (/Notificări/.test(fullDescription)) {
    const releaseCheck = readFileSync(join(ROOT, 'scripts', 'release-readiness.mjs'), 'utf8');
    assert.match(
      releaseCheck,
      /notific/i,
      'dacă listarea promite notificări, poarta de release trebuie să verifice notificările',
    );
  }
});
