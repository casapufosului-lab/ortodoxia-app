import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyFeastRank, isMajorFeast } from '../src/lib/feast-rank.ts';

const configSrc = readFileSync(new URL('../src/i18n/config.ts', import.meta.url), 'utf8');
const calendarSrc = readFileSync(new URL('../src/app/(tabs)/calendar.tsx', import.meta.url), 'utf8');
const notificationSrc = readFileSync(new URL('../src/lib/notification-logic.ts', import.meta.url), 'utf8');

test('Cyprus has one automatic church calendar', () => {
  assert.match(
    configSrc,
    /calendarCode:\s*'cy-church-of-cyprus'[\s\S]*?countryCode:\s*'CY'/,
  );

  assert.ok(
    configSrc.includes("if (countryCode === 'MD') return null;"),
  );

  assert.ok(
    configSrc.includes("return getCalendarsForCountry(countryCode)[0] ?? null;"),
  );
});

test('Greece and Cyprus use major-feast presentation', () => {
  // The legend still selects the major-feast wording for GR/CY.
  assert.ok(
    calendarSrc.includes(
      "(countryCode === 'GR' || countryCode === 'CY') ? 'calendar.majorFeastLegend' : 'calendar.redCrossLegend'",
    ),
  );

  // The classification itself must come from the canonical model: the Greek
  // calendar stores "δεσποτική/θεομητορική εορτή", which the canonical codes map
  // to great_feast / theotokos_feast. The previous assertion required a source
  // string that named the Greek calendars by hand, which the model replaced.
  assert.equal(classifyFeastRank('δεσποτική εορτή'), 'great_feast');
  assert.equal(classifyFeastRank('θεομητορική εορτή'), 'theotokos_feast');
  assert.equal(isMajorFeast(classifyFeastRank('δεσποτική εορτή')), true);
  assert.equal(isMajorFeast(classifyFeastRank('θεομητορική εορτή')), true);
  assert.ok(!calendarSrc.includes('isHighlightedFeast'));
});

test('notifications support Greece and Cyprus calendars', () => {
  assert.match(notificationSrc, /GR:\s*\['gr-church-of-greece'\]/);
  assert.match(notificationSrc, /CY:\s*\['cy-church-of-cyprus'\]/);

  assert.ok(
    notificationSrc.includes(
      "if (countryCode === 'GR' && calendarCode !== 'gr-church-of-greece') return true;",
    ),
  );

  assert.ok(
    notificationSrc.includes(
      "if (countryCode === 'CY' && calendarCode !== 'cy-church-of-cyprus') return true;",
    ),
  );
});