/**
 * Chunked, plaintext-free session storage for Supabase auth.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Supabase auth session contains a refresh token. It was originally written to
 * AsyncStorage, which is app-sandboxed but stored in clear: on a rooted/jailbroken
 * device, or through a device backup extraction, the token yields full account
 * takeover. `expo-secure-store` moves it to the iOS Keychain / Android Keystore.
 *
 * WHY CHUNKING
 * ------------
 * Android's SecureStore implementation rejects values larger than a few kilobytes. A
 * Supabase session is normally well under that, but it can grow (long
 * `user_metadata`, many provider tokens), and the first implementation degraded to
 * AsyncStorage in that case — silently reintroducing the exact plaintext storage this
 * module exists to remove. A value of any length is now split into fixed-size
 * fragments, each small enough for the platform, plus a small manifest.
 *
 * NO PLAINTEXT FALLBACK
 * ---------------------
 * If the secure store cannot be used the adapter raises. It never writes a token to
 * AsyncStorage: failing loudly is strictly better than persisting a credential in
 * clear, because a session that is not persisted costs the user one sign-in while a
 * leaked refresh token costs them the account.
 *
 * ATOMIC COMMIT (FIXED FOLLOWING A DEFECT FOUND BY TEST)
 * -----------------------------------------------------
 * A naive "write fragments, then write the manifest" scheme is NOT safe: writing the
 * new value's fragments overwrites the previous value's fragments in place, so an
 * interruption after overwriting fragment 0 leaves the OLD manifest pointing at a
 * MIXTURE of old and new data. The old session is then corrupt and the integrity
 * check rejects it, which means a failed `setItem` could destroy a working session.
 *
 * The scheme now isolates each write in its own fragment set:
 *   1. write the new value into fragments tagged with a fresh generation number;
 *   2. write the manifest LAST — the manifest is the single commit point and is the
 *      only item that ever disagrees with its predecessors;
 *   3. prune the previous generation's fragments.
 * A crash before step 2 leaves the previous manifest untouched, and because that
 * manifest names its own generation, the previous value is still fully readable.
 * Orphaned fragments from step 3 are pruned on the next read.
 *
 * The legacy AsyncStorage copy is removed only after the secure write has fully
 * succeeded, so an interruption during migration keeps the user signed in.
 */

/** Maximum characters per secure fragment. Comfortably under the Android limit. */
export const SECURE_CHUNK_SIZE = 1800;

/**
 * Suffix for the manifest item of `key`.
 *
 * The separator is `.` and NOT `:`. `expo-secure-store` refuses every key outside
 * `[A-Za-z0-9._-]` ("Invalid key provided to SecureStore"), the check runs in JS before
 * the platform call, so `:`-separated names were rejected on every read and every write.
 * The failure was quiet: `getItem` logged a warning and fell through to the plaintext
 * legacy store — exactly the storage this module exists to remove — while `setItem`
 * threw and no session was persisted at all. Found by running the app on a device.
 */
export const MANIFEST_SUFFIX = '.m';

/** Fragment name for generation `generation`, fragment `index`, of `key`. */
export function fragmentItemName(key: string, generation: number, index: number): string {
  return `${key}.${generation}.${index}`;
}

/** Item name of the manifest for `key`. */
export function manifestItemName(key: string): string {
  return `${key}${MANIFEST_SUFFIX}`;
}

/**
 * Wire shape of the manifest.
 *
 * JSON rather than a bare number so the format can evolve without ambiguity and so a
 * fragment value can never be mistaken for a manifest.
 */
export type SecureManifest = {
  /** Manifest format version. */
  v: 1;
  /** Generation number; fragments are named `<key>:<generation>:<index>`. */
  generation: number;
  /** Number of fragments; 0 means a single empty fragment. */
  n: number;
  /** Character length of the assembled value, used as an integrity check. */
  len: number;
};

export function encodeManifest(manifest: SecureManifest): string {
  return JSON.stringify(manifest);
}

/** Parse a manifest, returning null when absent, malformed, or an unknown version. */
export function decodeManifest(raw: string | null): SecureManifest | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SecureManifest>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.generation !== 'number' || !Number.isInteger(parsed.generation) || parsed.generation < 0) {
      return null;
    }
    if (typeof parsed.n !== 'number' || !Number.isInteger(parsed.n) || parsed.n < 0) return null;
    if (typeof parsed.len !== 'number' || !Number.isInteger(parsed.len) || parsed.len < 0) return null;
    return { v: 1, generation: parsed.generation, n: parsed.n, len: parsed.len };
  } catch {
    return null;
  }
}

/** Split a value into fragment strings. Always returns at least one fragment. */
export function splitIntoChunks(value: string, chunkSize: number = SECURE_CHUNK_SIZE): string[] {
  if (value.length === 0) return [''];
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += chunkSize) {
    chunks.push(value.slice(offset, offset + chunkSize));
  }
  return chunks;
}

/**
 * The minimal key/value API this adapter needs. Narrow on purpose so the storage logic
 * can be unit-tested with an in-memory double instead of a device.
 */
export type SecureKeyValueStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};

/** The legacy plaintext store, used only for a one-time migration read. */
export type LegacyKeyValueStore = {
  getItem: (key: string) => Promise<string | null>;
  removeItem: (key: string) => Promise<void>;
};

/** Raised when the platform secure store cannot be used at all. */
export class SecureStorageUnavailableError extends Error {
  constructor(key: string) {
    super(
      `Secure storage is unavailable, so the credential "${key}" was not persisted. `
      + 'It is never written to unencrypted storage.',
    );
    this.name = 'SecureStorageUnavailableError';
  }
}

/** Number of generations to scan back when pruning orphans. */
const PRUNE_GENERATION_LOOKBACK = 8;

export function createChunkedSecureStorage(
  secure: SecureKeyValueStore,
  legacy: LegacyKeyValueStore,
  isAvailable: () => boolean,
  onWarn: (message: string, detail?: unknown) => void = () => undefined,
): {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
} {
  /**
   * Delete fragments of generations other than `keepGeneration`.
   *
   * These can only be remnants of a superseded or unfinished value, so removing them
   * is always safe. Bounded so a corrupted manifest cannot trigger unbounded I/O.
   */
  async function pruneGenerations(key: string, keepGeneration: number): Promise<void> {
    const lowest = Math.max(0, keepGeneration - PRUNE_GENERATION_LOOKBACK);
    for (let generation = lowest; generation <= keepGeneration; generation += 1) {
      if (generation === keepGeneration) continue;
      let consecutiveMisses = 0;
      for (let index = 0; index < PRUNE_GENERATION_LOOKBACK; index += 1) {
        try {
          const existing = await secure.getItemAsync(fragmentItemName(key, generation, index));
          if (existing === null) {
            consecutiveMisses += 1;
            if (consecutiveMisses >= 2) break;
            continue;
          }
          consecutiveMisses = 0;
          await secure.deleteItemAsync(fragmentItemName(key, generation, index));
        } catch (error) {
          onWarn(`Could not prune an obsolete fragment of "${key}"`, error);
          break;
        }
      }
    }
  }

  async function readSecure(key: string): Promise<string | null> {
    const manifest = decodeManifest(await secure.getItemAsync(manifestItemName(key)));
    if (manifest === null) return null;

    const fragments: string[] = [];
    for (let index = 0; index < manifest.n; index += 1) {
      const fragment = await secure.getItemAsync(fragmentItemName(key, manifest.generation, index));
      if (fragment === null) {
        // An incomplete record must not be handed back as a truncated session.
        onWarn(`Secure record for "${key}" is incomplete (fragment ${index} missing)`);
        return null;
      }
      // Only the final fragment may be shorter than the chunk size. A longer value
      // means the stored record does not match the manifest that names it, so it is
      // rejected instead of being silently concatenated.
      const isLast = index === manifest.n - 1;
      if (!isLast && fragment.length !== SECURE_CHUNK_SIZE) {
        onWarn(`Secure record for "${key}" has a malformed fragment at index ${index}`);
        return null;
      }
      if (fragment.length > SECURE_CHUNK_SIZE) {
        onWarn(`Secure record for "${key}" has an oversized fragment at index ${index}`);
        return null;
      }
      fragments.push(fragment);
    }

    const value = fragments.join('');
    // The length is validated against the manifest rather than against whatever else
    // happens to be in the store, so an orphaned fragment from another generation
    // cannot make a valid record look corrupt.
    if (value.length !== manifest.len) {
      onWarn(`Secure record for "${key}" failed its length check`);
      return null;
    }

    // Opportunistic cleanup of generations left behind by an interrupted write.
    void pruneGenerations(key, manifest.generation);
    return value;
  }

  function nextGeneration(previous: SecureManifest | null): number {
    return (previous?.generation ?? -1) + 1;
  }

  async function writeSecure(key: string, value: string): Promise<void> {
    if (!isAvailable()) throw new SecureStorageUnavailableError(key);

    const previous = decodeManifest(await secure.getItemAsync(manifestItemName(key)));
    const generation = nextGeneration(previous);
    const fragments = splitIntoChunks(value);

    // Step 1: the new value lives in its own generation, so the previous value's
    // fragments are untouched until the manifest commits.
    for (let index = 0; index < fragments.length; index += 1) {
      await secure.setItemAsync(fragmentItemName(key, generation, index), fragments[index]);
    }

    // Step 2: the manifest is the single commit point.
    await secure.setItemAsync(
      manifestItemName(key),
      encodeManifest({ v: 1, generation, n: fragments.length, len: value.length }),
    );

    // Step 3: the superseded generation is now unreachable.
    await pruneGenerations(key, generation);
  }

  async function clearSecure(key: string): Promise<void> {
    const manifest = decodeManifest(await secure.getItemAsync(manifestItemName(key)));

    if (manifest) {
      for (let index = 0; index < manifest.n; index += 1) {
        await secure.deleteItemAsync(fragmentItemName(key, manifest.generation, index));
      }
    }

    // Sweep the recent generations as well: a manifest that failed to parse must not
    // leave credential material behind.
    const newest = manifest?.generation ?? 0;
    await pruneGenerationsSweep(key, newest);

    await secure.deleteItemAsync(manifestItemName(key));
  }

  /** Remove every fragment of every recent generation, including `newest`. */
  async function pruneGenerationsSweep(key: string, newest: number): Promise<void> {
    const lowest = Math.max(0, newest - PRUNE_GENERATION_LOOKBACK);
    for (let generation = lowest; generation <= newest; generation += 1) {
      let consecutiveMisses = 0;
      for (let index = 0; index < PRUNE_GENERATION_LOOKBACK; index += 1) {
        try {
          const existing = await secure.getItemAsync(fragmentItemName(key, generation, index));
          if (existing === null) {
            consecutiveMisses += 1;
            if (consecutiveMisses >= 2) break;
            continue;
          }
          consecutiveMisses = 0;
          await secure.deleteItemAsync(fragmentItemName(key, generation, index));
        } catch (error) {
          onWarn(`Could not clear a fragment of "${key}"`, error);
          break;
        }
      }
    }
  }

  return {
    getItem: async (key: string) => {
      if (!isAvailable()) {
        onWarn('Secure storage is unavailable; the legacy store is not used as a fallback');
        return null;
      }

      try {
        const secureValue = await readSecure(key);
        if (secureValue !== null) return secureValue;
      } catch (error) {
        onWarn(`Secure read of "${key}" failed`, error);
      }

      // One-time migration path for installs created before secure storage existed.
      const legacyValue = await legacy.getItem(key);
      if (legacyValue === null) return null;

      try {
        await writeSecure(key, legacyValue);
        // Remove the plaintext copy only now that the secure write has succeeded.
        await legacy.removeItem(key);
      } catch (error) {
        // The session still works from the legacy store this run. That is NOT the
        // secure path, so it is reported rather than silently accepted.
        onWarn(`Migrating "${key}" to secure storage failed; the plaintext copy was kept`, error);
      }
      return legacyValue;
    },

    setItem: async (key: string, value: string) => {
      // Throws when secure storage is unusable: a credential is never written in clear.
      await writeSecure(key, value);
      // The secure copy is authoritative; drop any legacy plaintext remnant.
      await legacy.removeItem(key);
    },

    removeItem: async (key: string) => {
      if (isAvailable()) {
        try {
          await clearSecure(key);
        } catch (error) {
          onWarn(`Secure delete of "${key}" failed`, error);
        }
      }
      // Always clear the legacy copy so a sign-out cannot leave a token behind.
      await legacy.removeItem(key);
    },
  };
}
