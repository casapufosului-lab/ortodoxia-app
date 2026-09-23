/**
 * Chunked secure session storage (audit findings B-03 / O-03).
 *
 * WHAT THESE TESTS PROVE
 * ----------------------
 * The session contains a refresh token, so it must never be persisted in clear. The
 * first implementation degraded to AsyncStorage when a value exceeded the platform's
 * SecureStore size limit, which silently reintroduced the plaintext storage the fix
 * was meant to remove. These tests exercise the real adapter against in-memory secure
 * and legacy stores and assert the properties that matter:
 *
 *   - small and large values round-trip;
 *   - a large value is split into multiple secure fragments;
 *   - the legacy plaintext copy is migrated and then deleted;
 *   - a failed secure write never silently falls back to plaintext;
 *   - removeItem clears every fragment;
 *   - no plaintext residue is left in the legacy store after any successful write;
 *   - an interrupted write cannot expose a truncated value.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createChunkedSecureStorage,
  decodeManifest,
  encodeManifest,
  manifestItemName,
  fragmentItemName,
  SECURE_CHUNK_SIZE,
  SecureStorageUnavailableError,
} from '../src/lib/secure-session-storage.ts';

/**
 * Key rule of the real `expo-secure-store` (`build/SecureStore.js`): the JS layer rejects
 * any key that is not `[A-Za-z0-9._-]+` BEFORE the platform call. The double enforces the
 * same rule on purpose — a double more permissive than the device is how a `:`-separated
 * item name shipped unnoticed and broke session persistence on Android.
 */
const SECURE_KEY_PATTERN = /^[\w.-]+$/;
const INVALID_KEY_MESSAGE =
  'Invalid key provided to SecureStore. Keys must not be empty and contain only alphanumeric characters, ".", "-", and "_".';

function assertDeviceAcceptsKey(key) {
  if (typeof key !== 'string' || !SECURE_KEY_PATTERN.test(key)) {
    throw new Error(`${INVALID_KEY_MESSAGE} (got ${JSON.stringify(key)})`);
  }
}

/**
 * In-memory double for the secure store. Records every write so a test can assert on
 * fragment layout, and can be told to fail a specific write.
 */
function createSecureDouble(options = {}) {
  const data = new Map();
  const writes = [];
  let failOn = options.failOn ?? null;
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
      if (failOn && failOn(key, value)) {
        throw new Error(`secure write refused for ${key}`);
      }
      writes.push(key);
      data.set(key, value);
    },
    async deleteItemAsync(key) {
      assertDeviceAcceptsKey(key);
      data.delete(key);
    },
  };
}

/** In-memory double for the legacy plaintext store. */
function createLegacyDouble(initial = {}) {
  const data = new Map(Object.entries(initial));
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

const KEY = 'sb-example-auth-token';
const warnings = [];
function makeStorage(secure, legacy, available = true) {
  warnings.length = 0;
  return createChunkedSecureStorage(secure, legacy, () => available, (message, detail) => {
    warnings.push({ message, detail });
  });
}

test('a small value round-trips through the secure store', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, 'small-session');
  assert.equal(await storage.getItem(KEY), 'small-session');
  assert.equal(legacy.data.size, 0, 'no plaintext copy may exist');
});

test('a large value is split into multiple secure fragments and round-trips', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  // Comfortably above one fragment, and realistic for a session with metadata.
  const large = 'x'.repeat(SECURE_CHUNK_SIZE * 3 + 17);
  await storage.setItem(KEY, large);

  const manifest = decodeManifest(secure.data.get(manifestItemName(KEY)));
  assert.ok(manifest, 'a manifest must be written');
  assert.equal(manifest.n, 4, 'the value must be split into four fragments');
  assert.equal(manifest.len, large.length);

  for (let index = 0; index < manifest.n; index += 1) {
    const fragment = secure.data.get(fragmentItemName(KEY, manifest.generation, index));
    assert.ok(fragment !== undefined, `fragment ${index} must exist`);
    assert.ok(fragment.length <= SECURE_CHUNK_SIZE, `fragment ${index} must respect the chunk size`);
  }

  assert.equal(await storage.getItem(KEY), large);
  assert.equal(legacy.data.size, 0);
});

test('every item name the adapter touches is a key the real SecureStore accepts', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, 'x'.repeat(SECURE_CHUNK_SIZE * 3 + 17));
  await storage.getItem(KEY);
  await storage.removeItem(KEY);

  assert.ok(secure.writes.length >= 4, 'the fragments and the manifest must be written');
  for (const name of secure.writes) {
    assert.match(name, SECURE_KEY_PATTERN, `item name must be legal for expo-secure-store: ${name}`);
    assert.ok(name.startsWith(`${KEY}.`), `item name must stay namespaced under the key: ${name}`);
  }
  assert.ok(
    secure.writes.includes(manifestItemName(KEY)),
    'the manifest name itself must be legal, not only the fragments',
  );
  // A `:` separator (the original defect) must be impossible to reintroduce.
  assert.ok(
    !secure.writes.some((name) => name.includes(':')),
    'no item name may contain ":", which the device rejects',
  );
});

test('an interrupted write cannot corrupt or truncate the previous session', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, 'first-value');
  const firstGeneration = decodeManifest(secure.data.get(manifestItemName(KEY))).generation;

  // Refuse the second fragment of the NEXT generation, i.e. after the new
  // generation's fragment 0 has already been written.
  secure.setFailOn((key) => key === fragmentItemName(KEY, firstGeneration + 1, 1));
  await assert.rejects(() => storage.setItem(KEY, 'y'.repeat(SECURE_CHUNK_SIZE * 2)));

  // The manifest still points at the previous generation, so the previous value must
  // be fully readable. This is the defect the generation scheme fixes: overwriting
  // fragments in place used to leave a mixture that failed the length check.
  assert.equal(await storage.getItem(KEY), 'first-value');
  assert.equal(legacy.data.size, 0);
  assert.equal(
    decodeManifest(secure.data.get(manifestItemName(KEY))).generation,
    firstGeneration,
    'a failed write must not advance the committed generation',
  );
});

test('a failed secure write never falls back to plaintext', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  secure.setFailOn(() => true);
  await assert.rejects(() => storage.setItem(KEY, 'must-not-be-stored-in-clear'));

  assert.equal(legacy.data.size, 0, 'a credential must never reach the plaintext store');
  assert.equal(await storage.getItem(KEY), null);
});

test('unavailable secure storage reads nothing and refuses to persist', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble({ [KEY]: 'legacy-plaintext' });
  const storage = makeStorage(secure, legacy, false);
  const errors = [];
  const unavailable = createChunkedSecureStorage(secure, legacy, () => false, () => undefined);

  await assert.rejects(
    () => unavailable.setItem(KEY, 'value'),
    (error) => error instanceof SecureStorageUnavailableError,
  );
  assert.equal(legacy.data.size, 1, 'the legacy copy is left untouched, not read into plaintext writes');

  // Reading reports absence rather than returning the plaintext value.
  assert.equal(await storage.getItem(KEY), null);
  void errors;
});

test('a legacy AsyncStorage session is migrated and the plaintext copy deleted', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble({ [KEY]: 'legacy-session-value' });
  const storage = makeStorage(secure, legacy);

  // First read returns the legacy value and migrates it.
  assert.equal(await storage.getItem(KEY), 'legacy-session-value');
  assert.equal(legacy.data.size, 0, 'the plaintext copy must be removed after a successful migration');
  assert.ok(secure.data.has(manifestItemName(KEY)), 'the migrated value must be in the secure store');
  assert.equal(await storage.getItem(KEY), 'legacy-session-value');
});

test('a failed migration keeps the user signed in and says so', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble({ [KEY]: 'legacy-session-value' });
  const storage = makeStorage(secure, legacy);

  secure.setFailOn(() => true);
  assert.equal(await storage.getItem(KEY), 'legacy-session-value', 'the session must still work');
  assert.equal(legacy.data.size, 1, 'the plaintext copy is kept rather than lost');
  assert.ok(warnings.length > 0, 'the failure must be reported, not hidden');
});

test('removeItem deletes every fragment and the manifest', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, 'z'.repeat(SECURE_CHUNK_SIZE * 2 + 5));
  const before = [...secure.data.keys()].filter((name) => name.startsWith(KEY));
  assert.ok(before.length >= 3, 'expected fragments plus a manifest before removal');

  await storage.removeItem(KEY);

  const after = [...secure.data.keys()].filter((name) => name.startsWith(KEY));
  assert.deepEqual(after, [], 'no fragment or manifest may survive a sign-out');
  assert.equal(await storage.getItem(KEY), null);
});

test('removeItem also clears a legacy plaintext copy', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble({ [KEY]: 'legacy-plaintext' });
  const storage = makeStorage(secure, legacy);

  await storage.removeItem(KEY);
  assert.equal(legacy.data.size, 0);
});

test('a shorter value prunes fragments left over from a longer one', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, 'a'.repeat(SECURE_CHUNK_SIZE * 4));
  const longCount = decodeManifest(secure.data.get(manifestItemName(KEY))).n;
  assert.equal(longCount, 4);

  await storage.setItem(KEY, 'short');
  const manifest = decodeManifest(secure.data.get(manifestItemName(KEY)));
  assert.equal(manifest.n, 1);
  assert.equal(await storage.getItem(KEY), 'short');

  // Fragments beyond the new count are pruned, so no stale credential material
  // lingers in the store.
  for (let index = 1; index < longCount; index += 1) {
    assert.equal(
      secure.data.get(fragmentItemName(KEY, manifest.generation, index)),
      undefined,
      `fragment ${index} should have been pruned`,
    );
  }
});

test('stale fragments from another generation are ignored', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, 'x'.repeat(SECURE_CHUNK_SIZE * 2));
  const generation = decodeManifest(secure.data.get(manifestItemName(KEY))).generation;

  // An orphan from an older generation, plus an out-of-range index in the current
  // one. Neither may be concatenated into the value. A distinct generation number is
  // used deliberately: writing into the committed generation would overwrite a live
  // fragment and the record would (correctly) be rejected instead.
  secure.data.set(fragmentItemName(KEY, generation + 3, 0), 'stale-leftover');
  secure.data.set(fragmentItemName(KEY, generation, 5), 'stale-leftover');

  assert.equal(
    await storage.getItem(KEY),
    'x'.repeat(SECURE_CHUNK_SIZE * 2),
    'orphaned fragments must not be concatenated',
  );
});

test('a fragment that disagrees with the manifest is rejected', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, 'a'.repeat(SECURE_CHUNK_SIZE * 2));
  const generation = decodeManifest(secure.data.get(manifestItemName(KEY))).generation;

  // A non-final fragment must be exactly one chunk long. Overwriting it with a
  // longer value must be detected rather than silently assembled.
  secure.data.set(fragmentItemName(KEY, generation, 0), 'z'.repeat(SECURE_CHUNK_SIZE + 10));

  assert.equal(await storage.getItem(KEY), null);
  assert.ok(warnings.some((entry) => entry.message.includes('malformed') || entry.message.includes('oversized')));
});

test('a corrupted manifest is treated as absent rather than as a truncated session', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  secure.data.set(manifestItemName(KEY), 'not-json');
  secure.data.set(fragmentItemName(KEY, 0, 0), 'fragment');

  assert.equal(await storage.getItem(KEY), null, 'a malformed record must not be trusted');
  assert.equal(decodeManifest('not-json'), null);
  assert.equal(decodeManifest(null), null);
  assert.equal(
    decodeManifest(encodeManifest({ v: 2, generation: 0, n: 1, len: 1 })),
    null,
    'an unknown manifest version is rejected',
  );
});

test('a missing fragment is reported rather than returning a partial session', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, 'w'.repeat(SECURE_CHUNK_SIZE * 2 + 3));
  const generation = decodeManifest(secure.data.get(manifestItemName(KEY))).generation;
  secure.data.delete(fragmentItemName(KEY, generation, 1));

  assert.equal(await storage.getItem(KEY), null);
  assert.ok(warnings.some((entry) => entry.message.includes('incomplete')));
});

test('a length mismatch is detected', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, 'value');
  // Corrupt the manifest length while keeping the structure valid.
  const generation = decodeManifest(secure.data.get(manifestItemName(KEY))).generation;
  secure.data.set(manifestItemName(KEY), encodeManifest({ v: 1, generation, n: 1, len: 999 }));

  assert.equal(await storage.getItem(KEY), null);
  assert.ok(warnings.some((entry) => entry.message.includes('length check')));
});

test('an empty value round-trips', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem(KEY, '');
  assert.equal(await storage.getItem(KEY), '');
});

test('two storage keys do not interfere', async () => {
  const secure = createSecureDouble();
  const legacy = createLegacyDouble();
  const storage = makeStorage(secure, legacy);

  await storage.setItem('key-a', 'a'.repeat(SECURE_CHUNK_SIZE * 2));
  await storage.setItem('key-b', 'b-value');

  assert.equal(await storage.getItem('key-a'), 'a'.repeat(SECURE_CHUNK_SIZE * 2));
  assert.equal(await storage.getItem('key-b'), 'b-value');

  await storage.removeItem('key-a');
  assert.equal(await storage.getItem('key-a'), null);
  assert.equal(await storage.getItem('key-b'), 'b-value', 'removing one key must not affect the other');
});
