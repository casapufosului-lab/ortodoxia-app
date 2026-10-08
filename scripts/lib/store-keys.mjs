/**
 * Cheile publice de magazin (RevenueCat) din profilurile EAS — poziția B6 din audit.
 *
 * DE CE E UN MODUL SEPARAT
 * ------------------------
 * Auditul a găsit că poarta de release putea spune PASS pentru un build în care
 * nimeni nu poate cumpăra nimic: `eas.json` declara
 * `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY: ""`, iar verificarea de atunci reacționa
 * doar la cheile care încep cu `test_`. Un șir gol trecea neobservat.
 *
 * Decizia „cheia asta poate vinde sau nu" stă acum într-o funcție pură, ca să poată
 * fi testată executând codul real, nu citind textul din scriptul de poartă.
 *
 * CE ESTE ȘI CE NU ESTE O CHEIE DE MAGAZIN
 * ----------------------------------------
 * `goog_…` / `appl_…` sunt chei PUBLICE (SDK public key): ajung oricum în bundle-ul
 * aplicației, deci nu sunt secrete. Cheia secreta (`sk_…`, folosită de webhook și de
 * REST API) nu are ce căuta nici aici, nici în bundle — poarta are o verificare
 * separată pentru valorile de server.
 */

/**
 * Cheile de magazin pe care le poate livra un profil EAS.
 *
 * `requiredForThisLaunch` spune dacă poarta are voie să dea FAIL când valoarea
 * lipsește: lansarea de față este pentru Google Play, deci cheia Google este
 * obligatorie, iar cea de App Store se raportează ca DEFERRED (nu blochează un build
 * Android, dar rămâne vizibilă) până când ownerul publică și pe iOS.
 */
export const STORE_KEY_PLATFORMS = Object.freeze([
  Object.freeze({
    name: 'EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY',
    platform: 'google',
    store: 'Google Play',
    requiredForThisLaunch: true,
  }),
  Object.freeze({
    name: 'EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY',
    platform: 'apple',
    store: 'App Store',
    requiredForThisLaunch: false,
  }),
]);

/**
 * Formele care nu pot lua niciodată o plată:
 *   - lipsă, gol, doar spații;
 *   - placeholder-ele din `.env.example` (`your_…`, `REPLACE…`, `CHANGEME…`, `xxx…`);
 *   - cheile de *Test Store* (`test_…`, `test-…`, `teststore…`), care în build-ul de
 *     release omoară procesul cu „Wrong API Key … The app will close now".
 */
const UNUSABLE_KEY_PATTERN = /^(test[._-]|teststore|your_|REPLACE|CHANGEME|xxx)/i;

/** True doar pentru o cheie care poate lua o plată reală. */
export function isUsableStoreKey(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return !UNUSABLE_KEY_PATTERN.test(trimmed);
}

/**
 * Evaluează un obiect `env` de profil EAS.
 *
 * Întoarce, pentru fiecare cheie cunoscută, dacă e declarată, dacă e utilizabilă și
 * ce valoare are (fără a o tipări nicăieri — poarta afișează doar numele cheii).
 */
export function evaluateStoreKeys(env) {
  const source = env && typeof env === 'object' ? env : {};
  return STORE_KEY_PLATFORMS.map((entry) => {
    const raw = source[entry.name];
    return {
      ...entry,
      declared: typeof raw === 'string',
      value: typeof raw === 'string' ? raw.trim() : '',
      usable: isUsableStoreKey(raw),
    };
  });
}
