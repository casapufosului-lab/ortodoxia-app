/**
 * Care dintre providerii externi de autentificare sunt chiar activi în Supabase.
 *
 * DE CE EXISTĂ
 * ------------
 * Ecranul de autentificare randa butonul „Continuă cu Apple" necondiționat, dar
 * proiectul are providerul Apple oprit: `GET /auth/v1/settings` răspunde
 * `"apple": false` (măsurat, vezi raportul). Butonul oferea deci o cale care nu
 * putea reuși — omul ajungea la Apple și se întorcea cu o eroare de provider.
 * Google Play nu cere autentificare cu Apple pe Android (regula e a Apple pentru
 * App Store), așa că singura comportare cinstită este să arăți butonul doar când
 * providerul e pornit, iar în ziua în care e pornit să apară singur.
 *
 * DECIZIA ȘI PARSAREA SUNT PURE, intenționat: testul de regresie exercită funcțiile
 * reale, nu lipește sursa cu `includes`. Apelul de rețea își primește `fetch`-ul și
 * adresa tot prin argument, din același motiv.
 */

export type ExternalAuthProvider = 'google' | 'apple';

/** Disponibilitatea cunoscută a providerilor, sau `null` cât timp e necunoscută. */
export type AuthProviderAvailability = Record<ExternalAuthProvider, boolean> | null;

/** Un apel de setări care se blochează nu are voie să țină ecranul: după atât, răspunsul e „necunoscut". */
export const AUTH_PROVIDERS_TIMEOUT_MS = 4_000;

/**
 * Transformă răspunsul lui `/auth/v1/settings` în două booleene.
 * `null` la orice formă neașteptată — „nu știu" e mereu o variantă validă.
 */
export function parseAuthProviderSettings(payload: unknown): AuthProviderAvailability {
  if (typeof payload !== 'object' || payload === null) return null;

  const external = (payload as { external?: unknown }).external;
  if (typeof external !== 'object' || external === null) return null;

  const flags = external as Record<string, unknown>;
  return { google: flags.google === true, apple: flags.apple === true };
}

/**
 * Dacă butonul pentru `provider` poate fi afișat.
 *
 * FAIL-OPEN, intenționat. `null` înseamnă că verificarea nu a răspuns (offline,
 * timeout, proxy). A ascunde un buton care funcționează e mai rău decât a-l arăta
 * pe unul care poate să nu meargă: al doilea e un drum închis din care omul poate
 * ieși, primul îi ia o cale de care are nevoie. Doar un `false` explicit de la
 * Supabase ascunde butonul.
 */
export function isProviderEnabled(
  availability: AuthProviderAvailability,
  provider: ExternalAuthProvider,
): boolean {
  if (availability === null) return true;
  return availability[provider] === true;
}

export type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export type AuthProviderFetchOptions = {
  url?: string;
  apiKey?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
};

/**
 * Citește o singură dată lista publică de provideri.
 *
 * Termenul e impus de `Promise.race`, nu doar de `AbortSignal`: un `fetch` care
 * ignoră signalul (sau un stub de test) ar putea altfel să atârne la nesfârșit.
 * Orice problemă de rețea întoarce `null`, adică „necunoscut" → fail-open.
 */
export async function fetchAuthProviderAvailability(
  options: AuthProviderFetchOptions = {},
): Promise<AuthProviderAvailability> {
  const url = options.url ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const apiKey = options.apiKey ?? process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike | undefined);
  const timeoutMs = options.timeoutMs ?? AUTH_PROVIDERS_TIMEOUT_MS;

  if (!url || !apiKey || typeof fetchImpl !== 'function') return null;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const request = fetchImpl(`${url}/auth/v1/settings`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${apiKey}` },
    signal: controller.signal,
  });
  // Dacă timeout-ul câștigă cursa, promisiunea pierzătoare nu are voie să devină
  // un „unhandled rejection": atașăm un handler gol.
  request.catch(() => undefined);

  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error('auth providers timeout'));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([request, expired]);
    if (!response.ok) return null;
    return parseAuthProviderSettings(await response.json());
  } catch {
    // Offline, anulat sau corp de răspuns stricat: „necunoscut" e răspunsul sigur.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

let cached: Promise<AuthProviderAvailability> | null = null;

/**
 * Varianta memorată folosită de ecran: un singur apel de setări pe rulare de aplicație.
 * Se memorează și eșecul, ca o rețea șubredă să nu declanșeze un apel la fiecare randare.
 */
export function loadAuthProviderAvailability(): Promise<AuthProviderAvailability> {
  if (!cached) cached = fetchAuthProviderAvailability();
  return cached;
}

/** Cusătură de test: uită răspunsul memorat. */
export function resetAuthProviderAvailabilityCache(): void {
  cached = null;
}
