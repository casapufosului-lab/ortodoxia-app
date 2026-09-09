import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const prayers = readFileSync('src/app/(tabs)/prayers.tsx', 'utf8');

test('MEDIUM #19 favorite toggles use a per-prayer busy guard', () => {
  assert.match(prayers, /const favoriteBusyRef = useRef\(new Set<string>\(\)\)/);
  assert.match(prayers, /if \(favoriteBusyRef\.current\.has\(prayerId\)\) return/);
  assert.match(prayers, /favoriteBusyRef\.current\.add\(prayerId\)/);
});

test('MEDIUM #19 favorite guard is always released', () => {
  assert.match(prayers, /finally\s*\{\s*favoriteBusyRef\.current\.delete\(prayerId\)/s);
});

test('MEDIUM #19 failed favorite writes roll optimistic UI back safely', () => {
  assert.match(prayers, /catch\s*\{/);
  assert.match(prayers, /ids\.includes\(prayerId\) \? ids : \[\.\.\.ids, prayerId\]/);
  assert.match(prayers, /setErrorMessage\(t\('prayers\.favoriteError'\)\)/);
});
