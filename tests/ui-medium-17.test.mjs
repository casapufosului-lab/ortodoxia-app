import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const home = readFileSync('src/app/(tabs)/index.tsx', 'utf8');

test('MEDIUM #17 Home uses request identity instead of blocking concurrent reloads', () => {
  assert.match(home, /const homeRequestRef = useRef\(0\)/);
  assert.match(home, /const requestId = \+\+homeRequestRef\.current/);
  assert.doesNotMatch(home, /isLoadingRef/);
});

test('MEDIUM #17 stale Home requests cannot publish results or errors', () => {
  const guards = home.match(/homeRequestRef\.current !== requestId/g) ?? [];
  assert.ok(guards.length >= 3);
  assert.match(home, /if \(homeRequestRef\.current === requestId\) \{\s*setIsLoading\(false\)/s);
});

test('MEDIUM #17 Home clears previous region content before loading new content', () => {
  assert.match(home, /setErrorMessage\(''\);\s*setDailyContent\(null\);\s*setCalendarDay\(null\);/s);
});

test('MEDIUM #17 effect cleanup invalidates in-flight Home request', () => {
  assert.match(home, /clearTimeout\(timeoutId\);\s*homeRequestRef\.current \+= 1;/s);
});
