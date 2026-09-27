/**
 * Teste pentru cheia favoritelor pe versete (`src/lib/verse-favorites.ts`).
 *
 * Ce se apără aici: cheia scrisă în baza de date trebuie să fie exact cheia citită înapoi. Patru
 * câmpuri (traducere, carte, capitol, verset), compuse într-un singur loc; dacă vreo parte ar
 * schimba formatul, favoritele s-ar salva fără să se mai regăsească, iar omul ar vedea inima
 * goală deși a apăsat-o.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isFavoriteKey,
  keysFromRows,
  toggleFavoriteKey,
  verseKey,
} from '../src/lib/verse-favorites.ts';

const REF = { translationId: 'ronbl', bookCode: 'JOH', chapter: 3, verse: 16 };

test('cheia unui verset are toate cele patru părți', () => {
  assert.equal(verseKey(REF), 'ronbl|JOH|3|16');
});

test('același verset dă aceeași cheie, de fiecare dată', () => {
  assert.equal(verseKey(REF), verseKey({ ...REF }));
});

test('versete diferite dau chei diferite', () => {
  const chei = [
    verseKey(REF),
    verseKey({ ...REF, verse: 17 }),
    verseKey({ ...REF, chapter: 4 }),
    verseKey({ ...REF, bookCode: 'MAT' }),
    verseKey({ ...REF, translationId: 'lxx' }),
  ];
  assert.equal(new Set(chei).size, chei.length);
});

test('inima se pune și se scoate', () => {
  const cheie = verseKey(REF);
  const pusă = toggleFavoriteKey([], cheie);
  assert.deepEqual(pusă, [cheie]);
  assert.equal(isFavoriteKey(pusă, cheie), true);
  const scoasă = toggleFavoriteKey(pusă, cheie);
  assert.deepEqual(scoasă, []);
  assert.equal(isFavoriteKey(scoasă, cheie), false);
});

test('comutarea nu atinge celelalte favorite', () => {
  const a = verseKey(REF);
  const b = verseKey({ ...REF, verse: 17 });
  assert.deepEqual(toggleFavoriteKey([a, b], a), [b]);
});

test('rândurile citite din bază devin chei', () => {
  const chei = keysFromRows([
    { translation_id: 'ronbl', book_code: 'JOH', chapter: 3, verse: 16 },
    { translation_id: 'ronbl', book_code: 'MAT', chapter: 5, verse: 3 },
  ]);
  assert.deepEqual(chei, ['ronbl|JOH|3|16', 'ronbl|MAT|5|3']);
});

test('rândurile stricate se aruncă, nu strică lista', () => {
  const chei = keysFromRows([
    {},
    null,
    undefined,
    { translation_id: 'ronbl', book_code: 'JOH', chapter: 3 },
    { translation_id: 'ronbl', book_code: 'JOH', chapter: 0, verse: 16 },
    { translation_id: 'ronbl', book_code: 'JOH', chapter: 3, verse: 1.5 },
    { translation_id: '', book_code: 'JOH', chapter: 3, verse: 16 },
    { translation_id: 'ronbl', book_code: 'JOH', chapter: 3, verse: 16 },
  ]);
  assert.deepEqual(chei, ['ronbl|JOH|3|16']);
});

test('același verset de două ori intră o singură dată', () => {
  const rând = { translation_id: 'ronbl', book_code: 'JOH', chapter: 3, verse: 16 };
  assert.deepEqual(keysFromRows([rând, rând]), ['ronbl|JOH|3|16']);
});
