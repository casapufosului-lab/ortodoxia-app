import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyFeastRank, isMajorFeast } from '../src/lib/feast-rank.ts';

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

test('AUD2-02 calendar keeps valid UTF-8 navigation and cross markers', () => {
  assert.ok(calendar.includes('\u2039'));
  assert.ok(calendar.includes('\u203a'));
  assert.equal(calendar.split('\u271d').length - 1, 3);
  assert.ok(!calendar.includes(String.fromCodePoint(0x00e2, 0x20ac, 0x00b9)));
  assert.ok(!calendar.includes(String.fromCodePoint(0x00e2, 0x20ac, 0x00ba)));
  assert.ok(!calendar.includes(String.fromCodePoint(0x00c8, 0x2122)));
});

/**
 * This assertion replaces `assert.ok(calendar.includes('cruce roșie'))`, which
 * only proved that a Romanian display literal existed in the screen. The screen
 * must no longer depend on that literal at all: the red-cross decision is made by
 * the canonical rank model, so the check exercises the real classifier.
 */
test('AUD2-02 red-cross marking is driven by the canonical rank model, not a Romanian literal', () => {
  assert.ok(!calendar.includes('cruce roșie'), 'the screen must not branch on a Romanian display literal');
  assert.ok(!calendar.includes('normalizedRank'));

  assert.equal(classifyFeastRank('cruce roșie'), 'red_cross');
  assert.equal(classifyFeastRank('cruce neagră'), 'black_cross');
  assert.equal(classifyFeastRank('δεσποτική εορτή'), 'great_feast');
  assert.equal(classifyFeastRank('θεομητορική εορτή'), 'theotokos_feast');
  assert.equal(classifyFeastRank('duminică'), 'sunday');
  assert.equal(classifyFeastRank(null), null);

  assert.equal(isMajorFeast(classifyFeastRank('cruce roșie')), true);
  assert.equal(isMajorFeast(classifyFeastRank('δεσποτική εορτή')), true);
  assert.equal(isMajorFeast(classifyFeastRank('cruce neagră')), false);
});
