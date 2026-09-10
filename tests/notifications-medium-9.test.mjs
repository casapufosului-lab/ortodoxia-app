import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOTIFICATION_SEND_WINDOW_MINUTES,
  classifyExpoPushTickets,
  isNotificationDue,
} from '../supabase/functions/send-daily-notifications/send-core.ts';

const root = process.cwd();

test('MEDIUM #9 retry window includes scheduled minute through +5 minutes', () => {
  assert.equal(NOTIFICATION_SEND_WINDOW_MINUTES, 5);
  assert.equal(isNotificationDue('10:00', '10:00'), true);
  assert.equal(isNotificationDue('10:00', '10:01'), true);
  assert.equal(isNotificationDue('10:00', '10:05'), true);
  assert.equal(isNotificationDue('10:00', '10:06'), false);
});

test('MEDIUM #9 retry window never sends before configured time', () => {
  assert.equal(isNotificationDue('10:00', '09:59'), false);
  assert.equal(isNotificationDue('10:00', '09:55'), false);
});

test('MEDIUM #9 retry window does not wrap across midnight', () => {
  assert.equal(isNotificationDue('23:59', '00:00'), false);
  assert.equal(isNotificationDue('23:58', '00:02'), false);
});

test('MEDIUM #9 invalid times fail closed', () => {
  assert.equal(isNotificationDue('25:00', '10:00'), false);
  assert.equal(isNotificationDue('10:00', '10:99'), false);
  assert.equal(isNotificationDue('bad', '10:00'), false);
});

test('MEDIUM #9 mixed Expo HTTP-200 tickets are classified individually', () => {
  const result = classifyExpoPushTickets(
    {
      data: [
        { status: 'ok', id: 'ticket-1' },
        { status: 'error', message: 'rate limited', details: { error: 'MessageRateExceeded' } },
        { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
      ],
    },
    3,
  );

  assert.deepEqual(result, {
    acceptedIndexes: [0],
    retryIndexes: [1],
    deactivateIndexes: [2],
    ambiguousIndexes: [],
  });
});

test('MEDIUM #9 accepts a single Expo ticket object for one recipient', () => {
  const result = classifyExpoPushTickets(
    { data: { status: 'ok', id: 'ticket-single' } },
    1,
  );

  assert.deepEqual(result, {
    acceptedIndexes: [0],
    retryIndexes: [],
    deactivateIndexes: [],
    ambiguousIndexes: [],
  });
});

test('MEDIUM #9 malformed Expo ticket payload fails closed', () => {
  assert.equal(classifyExpoPushTickets(null, 1), null);
  assert.equal(classifyExpoPushTickets({}, 1), null);
  assert.equal(classifyExpoPushTickets({ data: [] }, 1), null);
  const missingId = classifyExpoPushTickets({ data: [{ status: 'ok' }] }, 1);
  assert.deepEqual(missingId?.retryIndexes, []);
  assert.deepEqual(missingId?.ambiguousIndexes, [0]);

  const invalidTicket = classifyExpoPushTickets({ data: [null] }, 1);
  assert.deepEqual(invalidTicket?.retryIndexes, []);
  assert.deepEqual(invalidTicket?.ambiguousIndexes, [0]);

  const unknownTicket = classifyExpoPushTickets({ data: [{ status: 'unknown' }] }, 1);
  assert.deepEqual(unknownTicket?.retryIndexes, []);
  assert.deepEqual(unknownTicket?.ambiguousIndexes, [0]);
});

test('MEDIUM #9 ambiguous Expo outcomes preserve reservations to prevent duplicate sends', async () => {
  const { readFileSync } = await import('node:fs');
  const { dirname, join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, '..', 'supabase/functions/send-daily-notifications/index.ts'), 'utf8');

  const fetchBlock = source.slice(
    source.indexOf('let response: Response;'),
    source.indexOf('if (!response.ok)'),
  );
  assert.ok(fetchBlock.includes('catch'));
  assert.ok(!fetchBlock.includes('release_notification_reservation'));

  const jsonBlock = source.slice(
    source.indexOf('let expoPayload: unknown;'),
    source.indexOf('const tickets = classifyExpoPushTickets'),
  );
  assert.ok(jsonBlock.includes('response.json()'));
  assert.ok(!jsonBlock.includes('release_notification_reservation'));

  const malformedStart = source.indexOf('if (!tickets) {');
  const malformedEnd = source.indexOf('const retryDeviceIds', malformedStart);
  const malformedBlock = source.slice(malformedStart, malformedEnd);
  assert.ok(malformedStart >= 0);
  assert.ok(!malformedBlock.includes('release_notification_reservation'));
});

test('MEDIUM #9 index parses Expo tickets and counts only accepted tickets', () => {
  const fn = readFileSync(
    join(root, 'supabase/functions/send-daily-notifications/index.ts'),
    'utf8',
  );

  assert.ok(fn.includes('await response.json()'));
  assert.ok(fn.includes('classifyExpoPushTickets(expoPayload, pendingDevices.length)'));
  assert.ok(fn.includes('sent += tickets.acceptedIndexes.length'));
  assert.ok(!fn.includes('sent += messages.length'));
});

test('MEDIUM #9 retryable ticket errors release only retry devices', () => {
  const fn = readFileSync(
    join(root, 'supabase/functions/send-daily-notifications/index.ts'),
    'utf8',
  );

  assert.ok(fn.includes('const retryDeviceIds = tickets.retryIndexes.map'));
  assert.ok(fn.includes('p_device_ids: retryDeviceIds'));
});

test('MEDIUM #9 DeviceNotRegistered tokens are deactivated', () => {
  const fn = readFileSync(
    join(root, 'supabase/functions/send-daily-notifications/index.ts'),
    'utf8',
  );

  assert.ok(fn.includes('const deactivateDeviceIds = tickets.deactivateIndexes.map'));
  assert.ok(fn.includes(".from('notification_devices')"));
  assert.ok(fn.includes('.update({ is_active: false })'));
  assert.ok(fn.includes(".in('id', deactivateDeviceIds)"));
});
