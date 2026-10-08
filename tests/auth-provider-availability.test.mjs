/**
 * B1: butonul „Continuă cu Apple" nu are voie să ofere o cale care sigur eșuează.
 *
 * Cazul real, măsurat: `GET /auth/v1/settings` răspunde `"apple": false`, deci
 * providerul nu e activat în Supabase, iar butonul dusese deja la o eroare de
 * provider. Aceste teste exercită funcțiile reale din `src/lib/auth-providers.ts`
 * (modul pur, fără dependențe de React Native), nu lipește sursa cu `includes`.
 *
 * Testele pot pica: dacă „fail-open" devine „fail-closed", testul 3 cade; dacă
 * `parseAuthProviderSettings` întoarce `true` în loc de `false` pentru un mesaj
 * lipsă, testul 1 cade; dacă butonul din ecran nu mai consultă helperul, testul 9 cade.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const {
  parseAuthProviderSettings,
  isProviderEnabled,
  fetchAuthProviderAvailability,
  AUTH_PROVIDERS_TIMEOUT_MS,
} = await import(new URL('../src/lib/auth-providers.ts', import.meta.url).href);

const authScreen = readFileSync(join(root, 'src/app/auth.tsx'), 'utf8');

// Răspunsul real, copiat din măsurătoarea proiectului (cheia publică nu apare aici).
const REAL_SETTINGS = {
  external: {
    anonymous_users: true,
    apple: false,
    email: true,
    github: false,
    google: true,
  },
};

test('B1: the real settings payload is read as google=true, apple=false', () => {
  assert.deepEqual(parseAuthProviderSettings(REAL_SETTINGS), { google: true, apple: false });
});

test('B1: a payload without an external map means "unknown", never "enabled"', () => {
  // Un răspuns pe care nu-l înțelegem nu are voie să fie citit ca „providerul e pornit".
  assert.equal(parseAuthProviderSettings({}), null);
  assert.equal(parseAuthProviderSettings({ external: null }), null);
  assert.equal(parseAuthProviderSettings(null), null);
  assert.equal(parseAuthProviderSettings('nu e json'), null);

  // `external` prezent, dar fără cheia providerului: `false` explicit, nu „necunoscut".
  assert.deepEqual(parseAuthProviderSettings({ external: {} }), { google: false, apple: false });
});

test('B1: an unknown answer FAILS OPEN, so a working button is never hidden', () => {
  // Mutant: schimbă `if (availability === null) return true;` în `return false`
  // (fail-closed) și acest test cade — exact comportamentul pe care îl apărăm.
  assert.equal(isProviderEnabled(null, 'apple'), true);
  assert.equal(isProviderEnabled(null, 'google'), true);
});

test('B1: only an explicit false from Supabase hides a button', () => {
  assert.equal(isProviderEnabled({ google: true, apple: false }, 'apple'), false);
  assert.equal(isProviderEnabled({ google: true, apple: false }, 'google'), true);
  assert.equal(isProviderEnabled({ google: false, apple: true }, 'google'), false);
});

test('B1: a healthy settings call yields the parsed availability', async () => {
  const calls = [];
  const availability = await fetchAuthProviderAvailability({
    url: 'https://example.supabase.co',
    apiKey: 'cheie-publica-de-test',
    fetchImpl: async (input, init) => {
      calls.push({ input, init });
      return { ok: true, json: async () => REAL_SETTINGS };
    },
  });

  assert.deepEqual(availability, { google: true, apple: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, 'https://example.supabase.co/auth/v1/settings');
  assert.equal(calls[0].init.headers.apikey, 'cheie-publica-de-test');
  assert.ok(calls[0].init.signal, 'cererea trebuie să poarte un AbortSignal');
});

test('B1: an HTTP error, a throwing fetch and a missing configuration all mean "unknown"', async () => {
  const withStatus = (ok) => async () => ({ ok, json: async () => REAL_SETTINGS });

  assert.equal(
    await fetchAuthProviderAvailability({ url: 'https://x', apiKey: 'k', fetchImpl: withStatus(false) }),
    null,
  );
  assert.equal(
    await fetchAuthProviderAvailability({
      url: 'https://x',
      apiKey: 'k',
      fetchImpl: async () => { throw new Error('offline'); },
    }),
    null,
  );
  // Fără adresă sau fără cheie nu se face niciun apel.
  assert.equal(
    await fetchAuthProviderAvailability({ url: '', apiKey: '', fetchImpl: withStatus(true) }),
    null,
  );
});

test('B1: a settings call that never settles is bounded by the timeout', async () => {
  const started = Date.now();
  const availability = await fetchAuthProviderAvailability({
    url: 'https://x',
    apiKey: 'k',
    timeoutMs: 30,
    // Ignoră intenționat signalul: termenul trebuie impus de cod, nu de fetch.
    fetchImpl: () => new Promise(() => {}),
  });
  const elapsed = Date.now() - started;

  assert.equal(availability, null);
  assert.ok(elapsed < 1_000, `apelul blocat trebuie tăiat repede, a durat ${elapsed} ms`);
  assert.ok(AUTH_PROVIDERS_TIMEOUT_MS <= 5_000, 'termenul implicit trebuie să fie de ordinul secundelor');
});

test('B1: the sign-in screen hides the Apple button behind the helper', () => {
  assert.ok(
    authScreen.includes("isProviderEnabled(providerAvailability, 'apple')"),
    'butonul Apple trebuie să depindă de isProviderEnabled, nu să fie randat necondiționat',
  );
  assert.ok(
    authScreen.includes('loadAuthProviderAvailability'),
    'ecranul trebuie să încarce o dată disponibilitatea providerilor',
  );
  // Guard împotriva revenirii la randarea necondiționată: numele cheii de traducere
  // trebuie să apară o singură dată în fișier, în interiorul condiționalului.
  assert.equal(
    (authScreen.match(/auth\.continueWithApple/g) ?? []).length,
    1,
    'butonul Apple nu poate fi randat de două ori',
  );
});
