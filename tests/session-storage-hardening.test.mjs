/**
 * Session-storage wiring (audit findings B-03 / O-03).
 *
 * These assertions cover how `src/lib/supabase.ts` is wired — which storage both
 * clients receive and that no plaintext fallback exists anywhere in the module. The
 * chunking, migration, atomic-commit and removal behaviour of the adapter itself is
 * verified against an in-memory double in `tests/secure-session-storage.test.mjs`,
 * because that module is pure and can be executed.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const source = readFileSync(join(root, 'src/lib/supabase.ts'), 'utf8');
const adapter = readFileSync(join(root, 'src/lib/secure-session-storage.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const appJson = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));

test('expo-secure-store is a dependency and is registered as a config plugin', () => {
  assert.ok(
    pkg.dependencies['expo-secure-store'],
    'expo-secure-store must be a runtime dependency (it is imported by src/lib/supabase.ts)',
  );

  const plugins = appJson.expo.plugins ?? [];
  const secureStorePlugin = plugins.find((entry) => (
    Array.isArray(entry) ? entry[0] === 'expo-secure-store' : entry === 'expo-secure-store'
  ));
  assert.ok(secureStorePlugin, 'expo-secure-store must be registered in app.json plugins');
  assert.ok(
    Array.isArray(secureStorePlugin) && typeof secureStorePlugin[1]?.faceIDPermission === 'string',
    'the plugin must carry an explicit (localized) Face ID usage string',
  );
});

test('both Supabase clients use the hardened storage, not bare AsyncStorage', () => {
  assert.ok(source.includes("import * as SecureStore from 'expo-secure-store';"));
  assert.ok(source.includes('createChunkedSecureStorage'));

  // Neither client may be handed a raw store any more.
  assert.ok(!/storage:\s*Platform\.OS === 'web' \? webStorage : AsyncStorage/.test(source));
  assert.equal(
    (source.match(/storage: authStorage,/g) ?? []).length,
    2,
    'both the session client and the guest client must use authStorage',
  );
});

test('the app module contains no plaintext credential fallback', () => {
  // The previous implementation fell back to AsyncStorage when SecureStore was
  // unavailable or the value was too large. That is exactly what must not exist.
  assert.ok(!/AsyncStorage\.setItem\(/.test(source), 'supabase.ts must not write plaintext itself');
  assert.ok(!/storage:\s*AsyncStorage/.test(source));

  // AsyncStorage may only appear as the legacy migration source.
  assert.ok(source.includes('AsyncStorage'), 'AsyncStorage is still the migration source');
});

test('the chunked adapter refuses to persist when secure storage is unavailable', () => {
  assert.ok(adapter.includes('SECURE_CHUNK_SIZE'));
  assert.ok(adapter.includes('SecureStorageUnavailableError'));
  assert.ok(
    /if \(!isAvailable\(\)\) throw new SecureStorageUnavailableError\(key\)/.test(adapter),
    'writeSecure must throw rather than fall back',
  );
});

test('the manifest is the commit point and fragments use a fresh generation', () => {
  // Fragments are written before the manifest, and each write uses a new generation
  // so an interrupted write cannot overwrite the committed value's fragments.
  const writeStart = adapter.indexOf('async function writeSecure');
  const writeEnd = adapter.indexOf('async function clearSecure', writeStart);
  const writeBlock = adapter.slice(writeStart, writeEnd);

  const fragmentWrite = writeBlock.indexOf('setItemAsync(fragmentItemName(');
  const manifestWrite = writeBlock.indexOf('setItemAsync(\n      manifestItemName(key)');
  assert.ok(fragmentWrite >= 0, 'fragments must be written');
  assert.ok(manifestWrite > fragmentWrite, 'the manifest must be written after the fragments');
  assert.ok(writeBlock.includes('nextGeneration(previous)'));
});

test('removal and migration both clear the legacy plaintext copy', () => {
  assert.ok(adapter.includes('await legacy.removeItem(key);'));
  assert.ok(
    adapter.includes('await writeSecure(key, legacyValue);'),
    'the legacy value must be migrated into secure storage',
  );
  // The plaintext removal must come after a successful secure write.
  const getStart = adapter.indexOf('getItem: async (key: string) => {');
  const getEnd = adapter.indexOf('setItem: async (key: string, value: string) => {', getStart);
  const getBlock = adapter.slice(getStart, getEnd);
  const migratedWrite = getBlock.indexOf('await writeSecure(key, legacyValue);');
  const legacyRemoval = getBlock.indexOf('await legacy.removeItem(key);');
  assert.ok(migratedWrite >= 0 && legacyRemoval > migratedWrite);
});

test('web keeps using localStorage because SecureStore does not exist there', () => {
  assert.ok(source.includes("Platform.OS === 'web' ? webStorage : nativeStorage"));
});

test('no session material can reach the console', () => {
  // The adapter logs diagnostics for a storage failure, which is the only way an
  // operator learns that migration or pruning failed. It must never receive the key
  // name or the value: a session token written to a device log is a leaked token.
  for (const [name, text] of [['secure-session-storage.ts', adapter], ['supabase.ts', source]]) {
    const calls = text.match(/console\.[a-z]+\([^)]*\)/g) ?? [];
    for (const call of calls) {
      assert.ok(
        !/\b(value|token|session|fragment|key)\b/.test(call),
        `${name}: console call must not receive credential material: ${call}`,
      );
      assert.ok(
        !/`/.test(call),
        `${name}: console call must not interpolate runtime values: ${call}`,
      );
    }
  }
});

test('the secure manifest is versioned so the format can change safely', () => {
  assert.ok(adapter.includes('v: 1'), 'the manifest must carry an explicit version');
  assert.ok(
    /decodeManifest/.test(adapter) && /\.v !== 1|v !== MANIFEST_VERSION|version/.test(adapter),
    'an unknown manifest version must be rejected rather than misread',
  );
  // A rejected manifest must read as "no session", never as a partial one.
  assert.ok(adapter.includes('SecureStorageUnavailableError'));
});

test('secure item names stay inside the character set the device accepts', () => {
  // `expo-secure-store` refuses any key outside [A-Za-z0-9._-] before it reaches the
  // platform. A `:` separator shipped once: every read threw, the adapter logged a
  // warning and used the plaintext legacy store instead. Asserted on the source so the
  // rule cannot come back through a later refactor.
  assert.ok(
    adapter.includes("export const MANIFEST_SUFFIX = '.m';"),
    'the manifest suffix must use a separator the device accepts',
  );
  assert.ok(
    adapter.includes('return `${key}.${generation}.${index}`;'),
    'the fragment name must use a separator the device accepts',
  );
  assert.ok(
    !/\$\{key\}:/.test(adapter),
    'a fragment or manifest name must never be built with a ":" separator',
  );
});
