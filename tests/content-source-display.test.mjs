/**
 * Teste pentru `src/lib/content-source.ts` — poziția B12 / A2 din audit.
 *
 * Ce apără: sub „Pilda zilei" utilizatorul vedea codul intern al materialului
 * (`ro_versete_0057`) și, în 2 158 de rânduri, textul literal „NULL" în loc de sursă.
 * Testele de aici fixează regula „ce nu se citește de un om nu se afișează", plus două
 * verificări pe sursă, ca ecranele să nu reînceapă să randeze câmpul brut.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  displayableSource,
  isInternalContentId,
  isPlaceholderContentValue,
  stripEmptyParentheses,
  verseSourceLabel,
} from '../src/lib/content-source.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('„NULL" nu ajunge niciodată pe ecran', () => {
  for (const value of ['NULL', 'null', 'Null', ' NULL ', 'undefined', 'n/a', 'N/A', '-', '—']) {
    assert.equal(displayableSource(value), null, `„${value}" ar trebui ascuns`);
  }
});

test('golul și valorile lipsă se ascund, nu se afișează ca atare', () => {
  for (const value of ['', '   ', '\t\n', null, undefined]) {
    assert.equal(displayableSource(value), null);
    assert.equal(isPlaceholderContentValue(value), true);
  }
});

test('id-ul intern de material se ascunde', () => {
  for (const value of ['ro_versete_0057', 'ro_rugaciuni_012', 'en_prayers_003']) {
    assert.equal(isInternalContentId(value), true, `„${value}" e id intern`);
    assert.equal(displayableSource(value), null);
  }
});

test('o sursă reală rămâne neatinsă, cu diacritice cu tot', () => {
  for (const value of ['Coloseni 3:15', 'Biblia Liberă (VDC)', 'Sfântul Ioan Gură de Aur']) {
    assert.equal(displayableSource(value), value);
  }
});

test('un text care doar seamănă cu un id nu e tratat ca id', () => {
  // „Ioan 3" nu are forma unui id intern (fără număr final de material, fără underscore-limbă).
  assert.equal(isInternalContentId('Ioan 3'), false);
  assert.equal(displayableSource('Ioan 3'), 'Ioan 3');
  // Id-ul intern cere un număr la final.
  assert.equal(isInternalContentId('ro_versete'), false);
  // O sursă editorială cu underscore, dar fără prefix de limbă, rămâne vizibilă.
  assert.equal(displayableSource('Biblia_VDC'), 'Biblia_VDC');
});

test('referința biblică are prioritate în fața sursei editoriale', () => {
  assert.equal(verseSourceLabel('Coloseni 3:15', 'ro_versete_0057'), 'Coloseni 3:15');
  assert.equal(verseSourceLabel('Coloseni 3:15', 'Biblia Liberă'), 'Coloseni 3:15');
});

test('când referința e „NULL", se folosește sursa editorială citibilă', () => {
  assert.equal(verseSourceLabel('NULL', 'Sfântul Ioan Gură de Aur'), 'Sfântul Ioan Gură de Aur');
  assert.equal(verseSourceLabel(null, 'Biblia Liberă'), 'Biblia Liberă');
});

test('când nimic nu e citibil, linia de sursă dispare complet', () => {
  assert.equal(verseSourceLabel('NULL', 'ro_versete_0057'), null);
  assert.equal(verseSourceLabel('NULL', 'NULL'), null);
  assert.equal(verseSourceLabel(null, null), null);
});

test('ecranul principal nu mai randează câmpul brut, ci linia curățată', () => {
  const home = readFileSync(join(ROOT, 'src', 'app', '(tabs)', 'index.tsx'), 'utf8');
  assert.match(home, /verseSourceLabel\(/, 'ecranul principal trebuie să folosească verseSourceLabel');
  assert.doesNotMatch(
    home,
    />\{dailyContent\.editorial_source\}</,
    'id-ul intern nu are voie să se randeze direct (poziția A1/B12)',
  );
});

test('calendarul și rugăciunile filtrează la fel sursa editorială', () => {
  for (const file of ['calendar.tsx', 'prayers.tsx']) {
    const source = readFileSync(join(ROOT, 'src', 'app', '(tabs)', file), 'utf8');
    assert.match(source, /displayableSource\(/, `${file} trebuie să filtreze sursa`);
    assert.doesNotMatch(source, /\{selectedEntry\.editorial_source\}/, `${file} randează câmpul brut`);
  }
});

test('parantezele goale rămase din șablonul notificării se scot', () => {
  // Șabloanele din baza de date au forma `{verse_text} ({verse_source}) Începe ziua cu pace.`
  assert.equal(
    stripEmptyParentheses('Cuvântul zilei () Începe ziua cu pace.'),
    'Cuvântul zilei Începe ziua cu pace.',
  );
  assert.equal(
    stripEmptyParentheses('Cuvântul zilei (   ) Începe ziua cu pace.'),
    'Cuvântul zilei Începe ziua cu pace.',
  );
  // O referință reală se păstrează neatinsă, iar spațiile se normalizează.
  assert.equal(
    stripEmptyParentheses('Cuvântul zilei (Matei 21, 42)   Începe ziua cu pace.'),
    'Cuvântul zilei (Matei 21, 42) Începe ziua cu pace.',
  );
});

test('textul notificării trece prin aceleași filtre ca ecranul', () => {
  // `buildNotificationBody` nu poate fi importat aici: fișierul folosește aliasul `@/lib/…`, pe
  // care `node --experimental-strip-types` nu-l rezolvă. Comportamentul pur e testat mai sus, iar
  // aici se apără cablarea, ca `verse_source` brut să nu poată reintra în notificări.
  const notifications = readFileSync(join(ROOT, 'src', 'lib', 'notification-logic.ts'), 'utf8');
  assert.match(
    notifications,
    /import \{ displayableSource, stripEmptyParentheses \} from '@\/lib\/content-source';/,
    'notification-logic.ts trebuie să importe filtrele',
  );
  assert.match(
    notifications,
    /verse_source: displayableSource\(content\.verse_source\) \?\? ''/,
    'placeholderul {verse_source} trebuie filtrat',
  );
  assert.doesNotMatch(
    notifications,
    /\(\$\{content\.verse_source\}\)/,
    'corpul nu are voie să interpoleze sursa brută',
  );
  assert.match(
    notifications,
    /stripEmptyParentheses\(/,
    'șablonul trebuie curățat de parantezele goale',
  );
});
