/**
 * A3 — acoperirea calendarului: doar 2026 este publicat.
 *
 * De ce există testul: din ianuarie 2027 ecranele calendarului ar rămâne goale dacă nimeni
 * nu s-ar ocupa de ele. Decizia ownerului a fost „rămâne doar mesajul, decid mai târziu",
 * deci comportamentul de apărat este MESAJUL explicit, nu datele pentru 2027. Testul fixează:
 *   1. intervalul publicat e exact 2026-01 … 2026-12 (orice schimbare de interval se vede);
 *   2. ecranul randează mesajul explicit în afara intervalului și pentru o zi fără date;
 *   3. textele există în TOATE limbile — altfel utilizatorul nu vede mesajul, ci cheia brută.
 *
 * Dacă ownerul publică vreodată calendarele pentru 2027, actualizează întâi
 * `SEEDED_CALENDAR_RANGE` în `src/lib/feast-rank.ts` și abia apoi aici.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SEEDED_CALENDAR_RANGE, isMonthInSeededRange } from '../src/lib/feast-rank.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

test('intervalul publicat este exact 2026', () => {
  assert.deepEqual(SEEDED_CALENDAR_RANGE, { firstMonth: '2026-01', lastMonth: '2026-12' });
  assert.equal(isMonthInSeededRange('2026-01'), true);
  assert.equal(isMonthInSeededRange('2026-12'), true);
});

test('fiecare lună din 2027 e în afara intervalului publicat', () => {
  for (let m = 1; m <= 12; m += 1) {
    const key = `2027-${String(m).padStart(2, '0')}`;
    assert.equal(isMonthInSeededRange(key), false, `${key} nu are date publicate`);
  }
  assert.equal(isMonthInSeededRange('2025-12'), false);
});

test('ecranul spune explicit că luna nu e publicată, în loc să lase gol', () => {
  const calendar = read(join('src', 'app', '(tabs)', 'calendar.tsx'));
  assert.match(
    calendar,
    /!isMonthInSeededRange\(/,
    'mesajul pentru lună trebuie condiționat de acoperirea publicată',
  );
  assert.match(
    calendar,
    /t\('calendar\.monthOutsideCoverage'\)/,
    'lipsește mesajul pentru o lună în afara intervalului (cazul ianuarie 2027)',
  );
  assert.match(
    calendar,
    /t\('calendar\.emptyDay'\)/,
    'lipsește mesajul pentru o zi din interval care nu are date publicate',
  );
});

test('mesajele există în toate limbile, nu doar în română', () => {
  const i18n = read(join('src', 'i18n', 'config.ts'));
  for (const key of ['calendar.monthOutsideCoverage', 'calendar.emptyDay']) {
    const hits = i18n.split(`'${key}':`).length - 1;
    // Arborele are 10 limbi în `src/i18n/config.ts`; pragul prinde o limbă la care s-a uitat cheia.
    assert.ok(hits >= 10, `„${key}" apare doar de ${hits} ori, deși sunt 10 limbi`);
  }
});
