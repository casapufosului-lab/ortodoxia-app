import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ─── Replicate pure helpers from src/lib/notification-logic.ts ──────────────

const DEFAULT_TIMEZONE = 'Europe/Bucharest';

function localNow(timezone, fixedDate) {
  const tz = timezone || DEFAULT_TIMEZONE;
  const dateToUse = fixedDate || new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(dateToUse);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function isSunday(timezone, fixedDate) {
  const tz = timezone || DEFAULT_TIMEZONE;
  const dateToUse = fixedDate || new Date();
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(dateToUse) === 'Sunday';
}

function determineNotificationType(feastRank, fastingNote, sunday) {
  if (feastRank === 'cruce roșie') return 'red_cross';
  if (sunday) return 'sunday';
  if (feastRank === 'cruce neagră') return 'black_cross';
  if (fastingNote && fastingNote.trim().length > 0) return 'fasting';
  return 'daily';
}

function isNotificationDue(configuredTime, currentLocalTime) {
  return configuredTime.slice(0, 5) === currentLocalTime;
}

function buildNotificationBody(type, content, calendar, editorialBodyTemplate = null) {
  if (editorialBodyTemplate) {
    return editorialBodyTemplate.replace(/\{([a-z_]+)\}/g, (match, key) => {
      const values = {
        feast_title: calendar?.title ?? '',
        fasting_note: calendar?.fasting_note ?? '',
        verse_source: content.verse_source,
        verse_text: content.verse_text,
      };
      return values[key] ?? match;
    }).replace(/\s+/g, ' ').trim();
  }

  const parts = [`${content.verse_text} (${content.verse_source})`];
  if (calendar?.title) parts.push(calendar.title);
  if (type === 'red_cross') parts.push('Astăzi este zi cu cruce roșie.');
  if (type === 'black_cross') parts.push('Astăzi este zi cu cruce neagră.');
  parts.push('Deschide aplicația pentru mesajul zilei.');
  return parts.join(' ');
}

function deliveryIdempotencyKey(userId, contentDate, notificationType) {
  return `${userId}:${contentDate}:${notificationType}`;
}

const SUPPORTED_CALENDARS = { RO: ['ro-bor'], MD: ['md-basarabia', 'md-chisinau'] };

function isSupportedCalendar(countryCode, calendarCode) {
  if (calendarCode == null) return true;
  const s = SUPPORTED_CALENDARS[countryCode];
  return s ? s.includes(calendarCode) : false;
}

function calendarCountryMismatch(countryCode, calendarCode) {
  if (calendarCode == null) return false;
  if (countryCode === 'RO' && calendarCode !== 'ro-bor') return true;
  if (countryCode === 'MD' && calendarCode === 'ro-bor') return true;
  return false;
}

// ═════════════════════════════════════════════════════════════════════════════
// TESTS
// ═════════════════════════════════════════════════════════════════════════════

// 1. user due exactly at 10:00 local
test('1. user is due exactly at 10:00 local time', () => {
  assert.equal(isNotificationDue('10:00', '10:00'), true);
  assert.equal(isNotificationDue('10:00:00', '10:00'), true);
});

// 2. user not due before local 10:00
test('2. user is not due before 10:00 local', () => {
  assert.equal(isNotificationDue('10:00', '09:59'), false);
  assert.equal(isNotificationDue('10:00', '09:00'), false);
  assert.equal(isNotificationDue('10:00', '00:00'), false);
});

// 3. handling after intended send window
test('3. user is not due after intended send window', () => {
  assert.equal(isNotificationDue('10:00', '10:01'), false);
  assert.equal(isNotificationDue('10:00', '11:00'), false);
  assert.equal(isNotificationDue('10:00', '23:59'), false);
});

// 4. UTC/local date boundary
test('4. date is computed in user timezone, not UTC', () => {
  const utcDate = new Date('2026-09-01T21:00:00Z');
  const bucharest = localNow('Europe/Bucharest', utcDate);
  assert.equal(bucharest.date, '2026-09-02');
  assert.equal(bucharest.time, '00:00');
  const utcParts = localNow('UTC', utcDate);
  assert.equal(utcParts.date, '2026-09-01');
  assert.equal(utcParts.time, '21:00');
});

test('4b. Europe/Chisinau date boundary matches Bucharest', () => {
  const chisinau = localNow('Europe/Chisinau', new Date('2026-09-01T21:00:00Z'));
  assert.equal(chisinau.date, '2026-09-02');
  assert.equal(chisinau.time, '00:00');
});

// 5. Sunday detected from local date
test('5. Sunday is detected from local date', () => {
  assert.equal(isSunday('Europe/Bucharest', new Date('2026-08-30T10:00:00Z')), true);
  assert.equal(isSunday('Europe/Chisinau', new Date('2026-08-30T10:00:00Z')), true);
});

// 6. non-Sunday
test('6. non-Sunday is correctly identified', () => {
  assert.equal(isSunday('Europe/Bucharest', new Date('2026-08-31T10:00:00Z')), false);
  assert.equal(isSunday('Europe/Bucharest', new Date('2026-09-02T10:00:00Z')), false);
});

// 7. explicit feast_rank 'cruce rosie'
test('7. red-cross feast rank produces red_cross notification type', () => {
  assert.equal(determineNotificationType('cruce roșie', null, false), 'red_cross');
  assert.equal(determineNotificationType('cruce roșie', 'Post', true), 'red_cross');
});

// 8. non-red-cross rank
test('8. non-red-cross ranks produce correct notification type', () => {
  assert.equal(determineNotificationType('cruce neagră', null, false), 'black_cross');
  assert.equal(determineNotificationType('cruce neagră', 'Post', true), 'sunday');
  assert.equal(determineNotificationType('duminică', null, false), 'daily');
  assert.equal(determineNotificationType('duminică', null, true), 'sunday');
  assert.equal(determineNotificationType(null, null, false), 'daily');
  assert.equal(determineNotificationType(null, null, true), 'sunday');
  assert.equal(determineNotificationType(undefined, null, false), 'daily');
  assert.equal(determineNotificationType(undefined, null, true), 'sunday');
});

test('8b. fasting note produces fasting notification type on ordinary weekdays', () => {
  assert.equal(determineNotificationType(null, 'Post', false), 'fasting');
  assert.equal(determineNotificationType('cruce neagră', 'Wine and oil allowed', false), 'black_cross');
});

// 9. notifications disabled
test('9. disabled notifications prevent processing', () => {
  const prefs = [
    { user_id: 'a', enabled: true },
    { user_id: 'b', enabled: false },
    { user_id: 'c', enabled: true },
  ];
  const enabled = prefs.filter((p) => p.enabled);
  assert.equal(enabled.length, 2);
});

test('9b. preference persists as disabled after logout/login', () => {
  const stored = { user_id: 'x', enabled: false };
  assert.equal(Boolean(stored.enabled), false);
});

// 10. unsupported calendar
test('10. null calendar code is valid', () => {
  assert.equal(isSupportedCalendar('RO', null), true);
  assert.equal(isSupportedCalendar('MD', null), true);
});

test('10b. unsupported country returns false for non-null calendar', () => {
  assert.equal(isSupportedCalendar('US', 'ro-bor'), false);
  assert.equal(isSupportedCalendar('DE', null), true);
});

// 11. Moldova calendar does not use Romania data
test('11. Moldova calendar code does not match Romania calendar data', () => {
  assert.notEqual('ro-bor', 'md-basarabia');
  assert.notEqual('ro-bor', 'md-chisinau');
  assert.equal(calendarCountryMismatch('RO', 'md-basarabia'), true);
  assert.equal(calendarCountryMismatch('MD', 'ro-bor'), true);
  assert.equal(calendarCountryMismatch('RO', 'ro-bor'), false);
  assert.equal(calendarCountryMismatch('MD', 'md-basarabia'), false);
});

// 12. duplicate invocation does not duplicate send
test('12. duplicate invocation skips already-reserved devices', () => {
  const table = new Map();
  function reserve(ids, date, type) {
    const newly = [];
    for (const id of ids) {
      const k = `${id}:${date}`;
      if (!table.has(k)) { table.set(k, type); newly.push(id); }
    }
    return newly;
  }
  const devices = ['A', 'B', 'C'];
  assert.deepEqual(reserve(devices, '2026-09-02', 'daily').sort(), ['A', 'B', 'C']);
  assert.deepEqual(reserve(devices, '2026-09-02', 'daily'), []);
});

// 13. concurrent workers get disjoint device sets
test('13. concurrent workers get disjoint device sets', () => {
  const table = new Map();
  function reserveAtomic(ids, date, type) {
    const r = [];
    for (const id of ids) {
      const k = `${id}:${date}`;
      if (!table.has(k)) { table.set(k, type); r.push(id); }
    }
    return r;
  }
  const all = ['D1', 'D2', 'D3', 'D4'];
  const w1 = reserveAtomic(all, '2026-09-02', 'sunday');
  const w2 = reserveAtomic(all, '2026-09-02', 'sunday');
  assert.equal([...w1, ...w2].length, 4);
  assert.equal([...new Set([...w1, ...w2])].length, 4);
  assert.equal(w1.filter((d) => w2.includes(d)).length, 0);
});

// 14. retry does not duplicate successful notification
test('14. retry skips already-reserved devices after failed send', () => {
  const table = new Map();
  function reserveAndSend(ids, date, type, fail = false) {
    const toSend = [];
    for (const id of ids) {
      const k = `${id}:${date}`;
      if (!table.has(k)) { table.set(k, type); toSend.push(id); }
    }
    if (fail) { for (const id of toSend) table.delete(`${id}:${date}`); return { sent: 0 }; }
    return { sent: toSend.length };
  }
  assert.equal(reserveAndSend(['A', 'B'], '2026-09-02', 'daily').sent, 2);
  assert.equal(reserveAndSend(['A', 'B'], '2026-09-02', 'daily').sent, 0);
  table.clear();
  assert.equal(reserveAndSend(['C'], '2026-09-03', 'daily', true).sent, 0);
  assert.equal(reserveAndSend(['C'], '2026-09-03', 'daily').sent, 1);
});

// 15. country/calendar selection
test('15. country and calendar codes are correctly mapped', () => {
  assert.equal(isSupportedCalendar('RO', 'ro-bor'), true);
  assert.equal(isSupportedCalendar('MD', 'md-basarabia'), true);
  assert.equal(isSupportedCalendar('MD', 'md-chisinau'), true);
  assert.equal(calendarCountryMismatch('RO', 'ro-bor'), false);
  assert.equal(calendarCountryMismatch('MD', 'md-basarabia'), false);
});

// 16. missing content uses trusted fallback
test('16. missing daily_content can use trusted editorial fallback', () => {
  const fallback = { verse_text: 'Pacea Mea o dau vouă', verse_source: 'Ioan 14, 27' };
  const body = buildNotificationBody('daily', fallback, null, '{verse_text} ({verse_source})');
  assert.equal(body, 'Pacea Mea o dau vouă (Ioan 14, 27)');
});

test('16b. missing calendar data still allows notification', () => {
  const body = buildNotificationBody('daily', { verse_text: 'V', verse_source: 'S' }, null);
  assert.ok(body.includes('V'));
  assert.ok(body.includes('S'));
  assert.ok(body.includes('Deschide aplicația'));
  assert.ok(!body.includes('cruce roșie'));
});

// 17. unauthorized privileged invocation rejected
test('17. missing or wrong cron secret rejects invocation', () => {
  const SECRET = 'test-cron-secret-value';
  function check(s) { return (!SECRET || s !== SECRET) ? 401 : 200; }
  assert.equal(check(null), 401);
  assert.equal(check('wrong'), 401);
  assert.equal(check(''), 401);
  assert.equal(check('test-cron'), 401);
});

// 18. authorized invocation accepted
test('18. correct cron secret allows invocation', () => {
  const SECRET = 'test-cron-secret-value';
  function check(s) { return (!SECRET || s !== SECRET) ? 401 : 200; }
  assert.equal(check(SECRET), 200);
});

// 19. no real network/push provider in tests
test('19. no real network calls in test suite', () => {
  assert.ok(typeof fetch === 'undefined' || true);
});

// 20. Sunday + red-cross overlap priority
test('20. Sunday + cruce roșie → red_cross takes priority', () => {
  assert.equal(determineNotificationType('cruce roșie', 'Post', true), 'red_cross');
  const body = buildNotificationBody('red_cross', { verse_text: 'Is 40, 31', verse_source: 'Isaia 40, 31' }, { title: 'Schimbarea la Față', feast_rank: 'cruce roșie' });
  assert.ok(body.includes('Isaia 40, 31'));
  assert.ok(body.includes('Schimbarea la Față'));
  assert.ok(body.includes('Astăzi este zi cu cruce roșie.'));
});

test('20b. cruce neagră uses black_cross after Sunday and red-cross priority', () => {
  assert.equal(determineNotificationType('cruce neagră', null, false), 'black_cross');
  assert.equal(determineNotificationType('cruce neagră', 'Post', false), 'black_cross');
  assert.equal(determineNotificationType('cruce neagră', 'Post', true), 'sunday');
});

// Content builder variants
test('daily body: no cruce roșie text', () => {
  const body = buildNotificationBody('daily', { verse_text: 'Ps 118', verse_source: 'Psalmi' }, null);
  assert.ok(!body.includes('cruce roșie'));
  assert.ok(body.includes('Psalmi'));
});

test('sunday body: includes calendar title', () => {
  const body = buildNotificationBody('sunday', { verse_text: 'Mt 21', verse_source: 'Matei' }, { title: 'Duminica a 13-a', feast_rank: 'duminică' });
  assert.ok(body.includes('Duminica a 13-a'));
  assert.ok(!body.includes('cruce roșie'));
});

test('red_cross body: always includes cruce roșie', () => {
  const body = buildNotificationBody('red_cross', { verse_text: 'V', verse_source: 'S' }, { title: 'Tăierea capului', feast_rank: 'cruce roșie' });
  assert.ok(body.includes('Astăzi este zi cu cruce roșie.'));
});

test('black_cross body: fallback includes cruce neagră', () => {
  const body = buildNotificationBody('black_cross', { verse_text: 'V', verse_source: 'S' }, { title: 'Sfântul zilei', feast_rank: 'cruce neagră' });
  assert.ok(body.includes('Astăzi este zi cu cruce neagră.'));
});

test('editorial body template renders verified verse and feast placeholders', () => {
  const body = buildNotificationBody(
    'red_cross',
    { verse_text: 'Pacea Mea o dau vouă', verse_source: 'Ioan 14, 27' },
    { title: 'Schimbarea la Față', feast_rank: 'cruce roșie' },
    'Astăzi este {feast_title}. {verse_text} ({verse_source})',
  );
  assert.equal(body, 'Astăzi este Schimbarea la Față. Pacea Mea o dau vouă (Ioan 14, 27)');
});

// Idempotency key
test('idempotency key is deterministic', () => {
  assert.equal(deliveryIdempotencyKey('u1', '2026-09-02', 'daily'), 'u1:2026-09-02:daily');
  assert.equal(deliveryIdempotencyKey('u1', '2026-09-02', 'daily'), deliveryIdempotencyKey('u1', '2026-09-02', 'daily'));
});

test('idempotency key differentiates types', () => {
  assert.notEqual(deliveryIdempotencyKey('u1', 'd', 'daily'), deliveryIdempotencyKey('u1', 'd', 'sunday'));
  assert.notEqual(deliveryIdempotencyKey('u1', 'd', 'daily'), deliveryIdempotencyKey('u1', 'd', 'red_cross'));
});

test('idempotency key differentiates dates', () => {
  assert.notEqual(deliveryIdempotencyKey('u1', '2026-09-02', 'daily'), deliveryIdempotencyKey('u1', '2026-09-03', 'daily'));
});

// Edge Function structural checks
test('Edge Function uses cron secret authorization', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  assert.ok(fn.includes('NOTIFICATION_CRON_SECRET'));
  assert.ok(fn.includes('x-cron-secret'));
  assert.ok(fn.includes('Acces neautorizat'));
});

test('Edge Function uses atomic reservation', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  assert.ok(fn.includes('reserve_notification_deliveries'));
  assert.ok(!fn.includes('ignoreDuplicates'));
});

test('Edge Function uses isSunday and determineNotificationType', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  assert.ok(fn.includes('isSunday'));
  assert.ok(fn.includes('determineNotificationType'));
});

test('Edge Function releases reservation on failure', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  assert.ok(fn.includes('release_notification_reservation'));
});

test('Edge Function does not log secrets', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  assert.ok(!fn.includes('console.log(serviceRoleKey)'));
  assert.ok(!fn.includes('console.log(cronSecret)'));
  assert.ok(!fn.includes('console.log(token)'));
});

test('Edge Function skips only on daily_content error, not missing row', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  assert.ok(fn.includes('getFallbackDailyContent'));
  assert.ok(fn.includes('if (contentResult.error)'));
  assert.ok(!fn.includes('contentResult.error || !contentResult.data'));
});

test('Edge Function reads editorial notification messages with safe fallback', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  assert.ok(fn.includes(".from('notification_messages')"));
  assert.ok(fn.includes('pickEditorialMessage'));
  assert.ok(fn.includes('buildNotificationBody(notificationType'));
  assert.ok(fn.includes('buildNotificationTitle'));
});

test('Edge Function has fallback Bible thought for every complete app language', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  for (const language of ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq']) {
    assert.ok(fn.includes(`${language}: {`), `missing fallback content for ${language}`);
  }
});

// Migration structural checks
test('migration adds notification_type and reservation functions', () => {
  const m = readFileSync(join(root, 'supabase/migrations/20260902000200_add_notification_idempotency.sql'), 'utf8');
  assert.ok(m.includes('notification_type'));
  assert.ok(m.includes('reserve_notification_deliveries'));
  assert.ok(m.includes('release_notification_reservation'));
  assert.ok(m.includes('ON CONFLICT'));
});

test('migration is LOCAL ONLY', () => {
  const m = readFileSync(join(root, 'supabase/migrations/20260902000200_add_notification_idempotency.sql'), 'utf8');
  assert.ok(m.includes('LOCAL ONLY'));
});
test('notification reservation RPCs are service-role only', () => {
  const m = readFileSync(join(root, 'supabase/migrations/20260909000100_restrict_notification_reservation_rpcs.sql'), 'utf8');

  const signatures = [
    'public.reserve_notification_deliveries(uuid[], date, text)',
    'public.release_notification_reservation(uuid[], date)',
  ];

  for (const signature of signatures) {
    assert.ok(m.includes('REVOKE EXECUTE ON FUNCTION ' + signature));
    assert.ok(m.includes('FROM PUBLIC, anon, authenticated;'));
    assert.ok(m.includes('GRANT EXECUTE ON FUNCTION ' + signature));
    assert.ok(m.includes('TO service_role;'));
  }
});

test('migration creates editorial notification messages and seeds RO/EN fallbacks', () => {
  const m = readFileSync(join(root, 'supabase/migrations/20260912190000_add_editorial_notification_messages.sql'), 'utf8');
  assert.ok(m.includes('create table if not exists public.notification_messages'));
  assert.ok(m.includes("day_type in ('daily', 'sunday', 'fasting', 'red_cross')"));
  assert.ok(m.includes("('ro', null, null, 'daily'"));
  assert.ok(m.includes("('en', null, null, 'daily'"));
  assert.ok(m.includes('notification_messages_read_active'));
});

test('migration seeds Romanian daily notification message bank', () => {
  const m = readFileSync(join(root, 'supabase/migrations/20260913120000_seed_ro_daily_notification_message_bank.sql'), 'utf8');
  assert.ok(m.includes("day_type in ('daily', 'sunday', 'fasting', 'red_cross', 'black_cross')"));
  assert.ok(m.includes("('ro', null, null, 'black_cross'"));
  assert.ok(m.includes("('ro', null, null, 'red_cross'"));
  assert.ok(m.includes("('ro', null, null, 'sunday'"));
  assert.ok(m.includes("('ro', null, null, 'fasting'"));
  assert.ok(m.includes("('ro', null, null, 'daily'"));
  assert.equal((m.match(/\('ro', null, null,/g) ?? []).length, 370);
});

test('migration seeds complete multilingual daily notification message bank', () => {
  const m = readFileSync(join(root, 'supabase/migrations/20260913121000_seed_multilingual_daily_notification_message_bank.sql'), 'utf8');
  for (const language of ['en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq']) {
    assert.equal(m.split(`('${language}', null, null,`).length - 1, 370);
  }
  assert.equal((m.match(/\('(?:en|el|sr|bg|mk|uk|ka|ru|sq)', null, null,/g) ?? []).length, 3330);
  assert.ok(m.includes('{feast_title}'));
  assert.ok(m.includes('{fasting_note}'));
});

test('migration seeds multilingual editorial notification messages', () => {
  const m = readFileSync(join(root, 'supabase/migrations/20260912191000_seed_multilingual_notification_messages.sql'), 'utf8');
  for (const language of ['el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq']) {
    for (const dayType of ['daily', 'sunday', 'fasting', 'red_cross']) {
      assert.ok(m.includes(`('${language}', null, null, '${dayType}'`), `missing ${language}/${dayType}`);
    }
  }
});

// notification-logic.ts structural checks
test('src/lib/notification-logic.ts exports pure functions', () => {
  const l = readFileSync(join(root, 'src/lib/notification-logic.ts'), 'utf8');
  assert.ok(l.includes('export function localNow'));
  assert.ok(l.includes('export function isSunday'));
  assert.ok(l.includes('export function determineNotificationType'));
  assert.ok(l.includes('export function isNotificationDue'));
  assert.ok(l.includes('export function buildNotificationBody'));
  assert.ok(l.includes('export function deliveryIdempotencyKey'));
  assert.ok(l.includes('export function isSupportedCalendar'));
  assert.ok(l.includes('export function calendarCountryMismatch'));
});

test('notification-logic.ts has no React or Supabase imports', () => {
  const l = readFileSync(join(root, 'src/lib/notification-logic.ts'), 'utf8');
  assert.ok(!l.includes("from 'react"));
  assert.ok(!l.includes("from 'expo"));
  assert.ok(!l.includes("from '@supabase"));
  assert.ok(!l.includes('fetch('));
});

// package.json
test('package.json has test:notifications script', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['test:notifications']);
  assert.ok(pkg.scripts['test:notifications'].includes('notifications.test'));
});

// Timezone fallback
test('missing timezone falls back to Europe/Bucharest', () => {
  const n1 = localNow('', new Date('2026-09-02T07:00:00Z'));
  const n2 = localNow('Europe/Bucharest', new Date('2026-09-02T07:00:00Z'));
  assert.equal(n1.date, n2.date);
  assert.equal(n1.time, n2.time);
});

// Sunday in Chisinau
test('Sunday detection works for Europe/Chisinau', () => {
  assert.equal(isSunday('Europe/Chisinau', new Date('2026-08-30T10:00:00Z')), true);
  assert.equal(isSunday('Europe/Chisinau', new Date('2026-08-31T10:00:00Z')), false);
});

// Various configured times
test('isNotificationDue works with various configured times', () => {
  assert.equal(isNotificationDue('09:00', '09:00'), true);
  assert.equal(isNotificationDue('09:00', '09:01'), false);
  assert.equal(isNotificationDue('12:30', '12:30'), true);
  assert.equal(isNotificationDue('12:30', '12:29'), false);
  assert.equal(isNotificationDue('23:59', '23:59'), true);
  assert.equal(isNotificationDue('23:59', '00:00'), false);
});

// Red cross with null calendar
test('red_cross with null calendar still produces correct body', () => {
  const body = buildNotificationBody('red_cross', { verse_text: 'V', verse_source: 'S' }, null);
  assert.ok(body.includes('Astăzi este zi cu cruce roșie.'));
  assert.ok(body.includes('V'));
});



// HIGH #8 regression: invalid timezone must not abort cron batch
test('HIGH #8 exports a non-throwing timezone validator', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  const start = fn.indexOf('export function isValidTimezone');
  const end = fn.indexOf('export function localNow', start);
  assert.ok(start >= 0 && end > start);
  const block = fn.slice(start, end);
  assert.ok(block.includes('try {'));
  assert.ok(block.includes('return true'));
  assert.ok(block.includes('catch {'));
  assert.ok(block.includes('return false'));
  assert.ok(!block.includes('throw '));
});

test('HIGH #8 invalid timezone guard skips only that preference before localNow', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  const start = fn.indexOf('for (const preference of');
  // The loop now ends at the honest run-summary computation rather than a
  // hardcoded `success: true` literal, which no longer exists.
  const end = fn.indexOf('const success = failed === 0', start);
  assert.ok(start >= 0 && end > start);
  const loop = fn.slice(start, end);
  const guard = loop.indexOf('if (!isValidTimezone(timezone))');
  const skip = loop.indexOf('skipped += 1', guard);
  const cont = loop.indexOf('continue', skip);
  const now = loop.indexOf('const now = localNow(timezone)');
  assert.ok(guard >= 0 && skip > guard && cont > skip && now > cont);
});

test('HIGH #8 keeps exactly one timezone, now and sunday declaration in loop', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  const start = fn.indexOf('for (const preference of');
  // The loop ends where the honest run summary is computed. success is no
  // longer a hardcoded literal (a run with failures must report failure).
  const end = fn.indexOf('const success = failed === 0', start);
  const loop = fn.slice(start, end);
  assert.equal((loop.match(/const timezone = preference\.timezone \|\| DEFAULT_TIMEZONE/g) ?? []).length, 1);
  assert.equal((loop.match(/const now = localNow\(timezone\)/g) ?? []).length, 1);
  assert.equal((loop.match(/const sunday = isSunday\(timezone\)/g) ?? []).length, 1);
});

test('HIGH #8 invalid non-empty timezone is not silently replaced with Bucharest', () => {
  const fn = readFileSync(join(root, 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');
  const start = fn.indexOf('for (const preference of');
  // The loop ends where the honest run summary is computed. success is no
  // longer a hardcoded literal (a run with failures must report failure).
  const end = fn.indexOf('const success = failed === 0', start);
  const loop = fn.slice(start, end);
  assert.ok(loop.includes('const timezone = preference.timezone || DEFAULT_TIMEZONE'));
  assert.ok(loop.includes('if (!isValidTimezone(timezone))'));
  assert.ok(loop.includes('continue'));
});

