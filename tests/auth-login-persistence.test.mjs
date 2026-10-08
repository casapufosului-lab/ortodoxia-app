/**
 * Interactive sign-in persistence (blocker: "autentificarea nu tine").
 *
 * WHY THIS EXISTS
 * ---------------
 * The app signs in through the real Supabase client built in `src/lib/supabase.ts`,
 * whose storage is the chunked `expo-secure-store` adapter from
 * `src/lib/secure-session-storage.ts`. Until now every suite tested either the adapter
 * alone or the screen's source text: nothing drove a REAL `@supabase/auth-js` client
 * through the REAL adapter. So "a successful login survives a restart" and "a failed
 * write reaches the user as an error" were assumptions, not measurements.
 *
 * These tests inject in-memory store doubles plus a per-client stubbed `fetch` (not a
 * process-wide one: the runner uses `--test-isolation=none`, so globals installed here
 * would leak into every other suite) and measure:
 *
 *   1. `signInWithPassword` writes the session through the secure adapter, and leaves
 *      NOTHING in the legacy plaintext store;
 *   2. a SECOND client built over the same stores - a cold start after
 *      `adb shell am force-stop` - recovers that session. That is what "the session was
 *      written to disk" means;
 *   3. when the secure write fails, the sign-in REJECTS instead of reporting success,
 *      which is what makes the screen's catch block show an alert instead of leaving
 *      the user with a form that silently does nothing;
 *   4. every item name handed to the store is one the real device accepts.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';

import { createChunkedSecureStorage, manifestItemName } from '../src/lib/secure-session-storage.ts';

const SUPABASE_URL = 'https://exampleproject.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_unit_test_key_not_a_real_credential';
const STORAGE_KEY = 'sb-exampleproject-auth-token';
const USER_ID = '240db6ba-9cf8-4f91-a797-76b53b2c9690';

// Built by joining parts on purpose: no literal that looks like a credential belongs
// in a test file, even a throwaway one.
const FAKE_CREDENTIAL = ['unit', 'test', 'only'].join('-');
const CANNED_REFRESH_TOKEN = ['canned', 'refresh', 'token'].join('-');

/**
 * Key rule of the real `expo-secure-store`: the JS layer rejects any key outside
 * `[A-Za-z0-9._-]+` BEFORE the platform call. The double enforces it too, because a
 * double more permissive than the device is exactly how a `:`-separated item name once
 * shipped and broke session persistence on Android.
 */
const SECURE_KEY_PATTERN = /^[\w.-]+$/;

function assertDeviceAcceptsKey(key) {
  assert.ok(
    typeof key === 'string' && SECURE_KEY_PATTERN.test(key),
    `SecureStore would reject the item name ${JSON.stringify(key)}`,
  );
}

function createSecureDouble() {
  const data = new Map();
  const writes = [];
  let failOn = null;
  return {
    data,
    writes,
    setFailOn(predicate) {
      failOn = predicate;
    },
    async getItemAsync(key) {
      assertDeviceAcceptsKey(key);
      return data.has(key) ? data.get(key) : null;
    },
    async setItemAsync(key, value) {
      assertDeviceAcceptsKey(key);
      if (failOn && failOn(key, value)) throw new Error(`secure write refused for ${key}`);
      writes.push(key);
      data.set(key, value);
    },
    async deleteItemAsync(key) {
      assertDeviceAcceptsKey(key);
      data.delete(key);
    },
  };
}

function createLegacyDouble() {
  const data = new Map();
  return {
    data,
    async getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async setItem(key, value) {
      data.set(key, value);
    },
    async removeItem(key) {
      data.delete(key);
    },
  };
}

function makeStorage(secure, legacy, available = true) {
  return createChunkedSecureStorage(secure, legacy, () => available, () => undefined);
}

/** A token-endpoint response with the shape `signInWithPassword` expects. */
function sessionPayload() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: ['canned', 'access', 'token'].join('-'),
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: CANNED_REFRESH_TOKEN,
    user: {
      id: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'unit-test@example.invalid',
      email_confirmed_at: '2026-10-01T00:00:00Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: '2026-10-01T00:00:00Z',
      updated_at: '2026-10-01T00:00:00Z',
      is_anonymous: false,
    },
  };
}

function createFetchStub(payload, options = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);
    calls.push({ url, method: init?.method ?? 'GET' });
    if (options.reject) throw new TypeError('Network request failed');
    return new Response(JSON.stringify(payload), {
      status: options.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { fetchImpl, calls };
}

/**
 * A real Supabase client, wired exactly like the app's: the chunked secure adapter as
 * `storage`, with the network stubbed per client.
 */
function makeClient({ storage, fetchImpl }) {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: {
      storage,
      storageKey: STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchImpl },
  });
}

test('a successful sign-in is written to the secure store and never to plaintext', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const { fetchImpl, calls } = createFetchStub(sessionPayload());
  const client = makeClient({ storage: makeStorage(secure, legacy), fetchImpl });

  const { data, error } = await client.auth.signInWithPassword({
    email: 'unit-test@example.invalid',
    password: FAKE_CREDENTIAL,
  });

  assert.equal(error, null, 'sign-in must not report an error for a 200 from the token endpoint');
  assert.equal(data?.session?.user?.id, USER_ID);

  // The token endpoint really was the thing being called.
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/auth\/v1\/token\?grant_type=password$/);
  assert.equal(calls[0].method, 'POST');

  // Persisted through the secure adapter ...
  assert.ok(secure.writes.length > 0, 'the session must have been written to the secure store');
  const stored = [...secure.data.values()].join('\n');
  assert.ok(stored.includes(CANNED_REFRESH_TOKEN), 'the refresh token must be in the secure store');

  // ... and nothing at all was left in the plaintext store.
  assert.equal(legacy.data.size, 0, 'no session material may reach the legacy plaintext store');
});

test('a second client over the same stores recovers the session (cold start)', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const first = createFetchStub(sessionPayload());
  const storage = makeStorage(secure, legacy);

  const signIn = await makeClient({ storage, fetchImpl: first.fetchImpl }).auth.signInWithPassword({
    email: 'unit-test@example.invalid',
    password: FAKE_CREDENTIAL,
  });
  assert.equal(signIn.error, null);

  // This is the restart: a brand-new client, the same on-disk stores, and a network
  // stub that would fail loudly if anything tried to refresh.
  const second = createFetchStub(null, { reject: true });
  const restarted = makeClient({ storage: makeStorage(secure, legacy), fetchImpl: second.fetchImpl });
  const { data, error } = await restarted.auth.getSession();

  assert.equal(error, null);
  assert.equal(data?.session?.user?.id, USER_ID, 'the restored session must be the one that was signed in with');
  assert.equal(second.calls.length, 0, 'a stored, unexpired session must be read, not re-fetched');
});

test('a failed secure write makes the sign-in reject instead of pretending to succeed', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const { fetchImpl } = createFetchStub(sessionPayload());
  const client = makeClient({ storage: makeStorage(secure, legacy), fetchImpl });

  // The device refuses the write (locked keystore, quota, hardware failure).
  secure.setFailOn(() => true);

  await assert.rejects(
    () => client.auth.signInWithPassword({ email: 'unit-test@example.invalid', password: FAKE_CREDENTIAL }),
    'a session that cannot be persisted must surface as an error the screen can alert on',
  );

  // Nothing half-written, and above all no plaintext fallback.
  assert.equal(secure.data.size, 0);
  assert.equal(legacy.data.size, 0, 'a refused secure write must never degrade to plaintext');

  // And the client must not claim to be signed in.
  const { data } = await client.auth.getSession();
  assert.equal(data?.session ?? null, null, 'no session may be presented after a refused write');
});

test('the secure item names produced for a session are ones the device accepts', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const { fetchImpl } = createFetchStub(sessionPayload());
  const client = makeClient({ storage: makeStorage(secure, legacy), fetchImpl });

  const { error } = await client.auth.signInWithPassword({
    email: 'unit-test@example.invalid',
    password: FAKE_CREDENTIAL,
  });
  assert.equal(error, null);

  // The doubles assert the charset on every call, so reaching this point already proves
  // it; this pins the prefix so a storage-key change cannot slip through unnoticed.
  assert.ok(
    secure.writes.every((key) => key.startsWith(STORAGE_KEY)),
    `unexpected item names: ${secure.writes.join(', ')}`,
  );
  assert.ok(
    secure.writes.some((key) => key === manifestItemName(STORAGE_KEY) || /\.\d+\.\d+$/.test(key)),
    `expected a manifest or chunked fragments, saw: ${secure.writes.join(', ')}`,
  );
});
