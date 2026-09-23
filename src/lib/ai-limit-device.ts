import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * A stable, per-install identifier sent with each chat request as `x-device-id`.
 *
 * WHY IT EXISTS
 * -------------
 * The server enforces three brakes for free identities: messages per account per day, per
 * (device + IP) per day, and per IP per day. The account one is free to reset (an anonymous
 * session takes a single call), so the device signal is what makes the other two meaningful.
 *
 * WHAT IT IS NOT
 * --------------
 * It is an abuse-control signal, not authentication. The server never trusts it on its own: it
 * hashes it together with the client address and a server-only salt, and the IP-only brake
 * still applies when this value is missing, rotated, or reset by reinstalling the app.
 *
 * The value is stored in the platform Keychain / Keystore through expo-secure-store. If that
 * storage is unavailable the identifier is still generated for the current session: a chat
 * request must not fail because a device identifier could not be written to disk.
 */
const STORAGE_KEY = 'ortodoxia-ai-device-id';

/** Same shape the Edge Function accepts: bounded, lower-case, no separators beyond `._-`. */
const DEVICE_ID_PATTERN = /^[a-z0-9._-]{8,64}$/;

let cached: string | null = null;

/** A random identifier. Weak randomness is acceptable here: it is not a secret or a token. */
function randomDeviceId(): string {
  const webCrypto = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID().toLowerCase();
  const chunk = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `${chunk()}${chunk()}-${chunk()}-${chunk()}`;
}

function webStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

async function readStored(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return webStorage()?.getItem(STORAGE_KEY) ?? null;
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeStored(value: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      webStorage()?.setItem(STORAGE_KEY, value);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_KEY, value);
  } catch {
    // Best effort: the request still carries a value for this session.
  }
}

/**
 * The identifier for this installation, created once and reused.
 *
 * A stored value that no longer matches the accepted shape is replaced instead of sent: the
 * server would answer with no device counter at all, and a silent downgrade is worse than a
 * new identifier.
 */
export async function getAiLimitDeviceId(): Promise<string> {
  if (cached !== null) return cached;

  const stored = await readStored();
  if (stored !== null && DEVICE_ID_PATTERN.test(stored)) {
    cached = stored;
    return cached;
  }

  const created = randomDeviceId();
  cached = created;
  await writeStored(created);
  return created;
}

/** Test hook: forgets the in-memory value so the stored one is read again. */
export function resetAiLimitDeviceIdCache(): void {
  cached = null;
}
