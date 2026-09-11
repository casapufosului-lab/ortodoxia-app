import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  assert.ok(
    calendarSrc.includes(
      "(countryCode === 'GR' || countryCode === 'CY') ? 'calendar.majorFeastLegend' : 'calendar.redCrossLegend'",
    ),
  );

  assert.ok(
    calendarSrc.includes(
      "const isHighlightedFeast = (countryCode === 'GR' || countryCode === 'CY')",
    ),
  );
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