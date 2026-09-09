import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const calendar = readFileSync('src/app/(tabs)/calendar.tsx', 'utf8');

test('MEDIUM #16 month title uses a UTC-stable date', () => {
  assert.match(calendar, /timeZone:\s*'UTC'/);
  assert.match(calendar, /Date\.UTC\(viewedYear, monthIndex, 1\)/);
  assert.doesNotMatch(calendar, /\.format\(viewedMonth\)/);
});

test('MEDIUM #16 UTC month label cannot roll into previous month', () => {
  const date = new Date(Date.UTC(2026, 8, 1));

  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);

  assert.equal(label, 'September 2026');
});
test('AUD2-02 calendar keeps valid UTF-8 navigation, cross markers and red-cross rank', () => {
  assert.ok(calendar.includes('\u2039'));
  assert.ok(calendar.includes('\u203a'));
  assert.equal(calendar.split('\u271d').length - 1, 3);
  assert.ok(calendar.includes('cruce ro\u0219ie'));
  assert.ok(!calendar.includes(String.fromCodePoint(0x00e2, 0x20ac, 0x00b9)));
  assert.ok(!calendar.includes(String.fromCodePoint(0x00e2, 0x20ac, 0x00ba)));
  assert.ok(!calendar.includes(String.fromCodePoint(0x00c8, 0x2122)));
});
