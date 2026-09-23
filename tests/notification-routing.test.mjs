/**
 * Notification tap routing (audit findings F-07 / K-02).
 *
 * The Edge Function always attached `data.url` to the daily push, but nothing read
 * it, so tapping a notification could not route anywhere in the app. Routing is now
 * implemented — and therefore has to be validated, because the payload ultimately
 * comes from a push message: a forged or malformed value must not be able to send
 * the user somewhere unexpected.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNotificationRoute } from '../src/lib/notification-routing.ts';

test('an in-app relative path is honoured', () => {
  assert.equal(resolveNotificationRoute({ url: '/' }), '/');
  assert.equal(resolveNotificationRoute({ url: '/calendar' }), '/calendar');
  assert.equal(resolveNotificationRoute({ url: '/prayers' }), '/prayers');
  assert.equal(resolveNotificationRoute({ url: '  /live  ' }), '/live');
});

test('absolute and scheme-carrying values are rejected', () => {
  // A push payload must never be able to navigate off-app or into another scheme.
  assert.equal(resolveNotificationRoute({ url: 'https://evil.example.com' }), '/');
  assert.equal(resolveNotificationRoute({ url: 'http://evil.example.com/calendar' }), '/');
  assert.equal(resolveNotificationRoute({ url: 'javascript:alert(1)' }), '/');
  assert.equal(resolveNotificationRoute({ url: 'ortodoxia://auth' }), '/');
  assert.equal(resolveNotificationRoute({ url: '//evil.example.com' }), '/');
  assert.equal(resolveNotificationRoute({ url: 'calendar' }), '/');
});

test('missing or malformed payloads fall back to home', () => {
  assert.equal(resolveNotificationRoute(null), '/');
  assert.equal(resolveNotificationRoute(undefined), '/');
  assert.equal(resolveNotificationRoute({}), '/');
  assert.equal(resolveNotificationRoute({ url: '' }), '/');
  assert.equal(resolveNotificationRoute({ url: '   ' }), '/');
  assert.equal(resolveNotificationRoute({ url: 42 }), '/');
  assert.equal(resolveNotificationRoute({ url: { href: '/calendar' } }), '/');
});
