/**
 * Configurare dinamică Expo, ca `google-services.json` (FCM) să nu fie legat de o cale inexistentă.
 *
 * DE CE E NEVOIE
 * --------------
 * `app.json` declară `android.googleServicesFile: "./google-services.json"`, dar fișierul NU stă în
 * rădăcina depozitului: scannerul de credențe din `scripts/release-readiness.mjs` (§9) găsește în el
 * cheia `AIza…` și oprește garda cu „possible Google API key". Deci fișierul stă în afara depozitului,
 * iar `app.json` e singurul loc versionat care îl numește. Până acum funcționa doar pentru că exista o
 * copie în `android/app/google-services.json` — folder Git-ignorat, regenerat de `expo prebuild`.
 *
 * CE FACE
 * -------
 * Când variabila de mediu `GOOGLE_SERVICES_JSON_PATH` (sau `GOOGLE_SERVICES_JSON`, numele folosit de
 * variabilele de tip „file" din EAS Build — acolo valoarea este tot o cale) indică un fișier existent,
 * configurarea folosește calea aceea. Altfel rămâne valoarea din `app.json`, neschimbată: prebuild va
 * cere fișierul și se oprește zgomotos dacă lipsește, în loc să producă un build fără FCM în tăcere.
 *
 * `app.json` rămâne sursa de adevăr pentru `googleServicesFile` (verificarea din
 * `scripts/release-readiness.mjs` citește `app.json`), iar aici se schimbă doar ce diferă de la o
 * mașină la alta: calea reală a fișierului de credențe.
 */
const { existsSync } = require('node:fs');
const { isAbsolute, resolve } = require('node:path');

/** Calea implicită, declarată și în `app.json` (rămâne valabilă când nu se dă nicio variabilă). */
const DEFAULT_GOOGLE_SERVICES_PATH = './google-services.json';

/** Numele de variabile acceptate, în ordinea importanței. */
const GOOGLE_SERVICES_ENV_NAMES = ['GOOGLE_SERVICES_JSON_PATH', 'GOOGLE_SERVICES_JSON'];

/**
 * Rezolvă calea către `google-services.json`.
 *
 * `exists` este injectabil ca funcția să fie verificabilă fără să scriem fișiere de credențe pe disc.
 * Ordinea: variabila de mediu (dacă arată spre un fișier existent) → calea implicită din `app.json`.
 */
function resolveGoogleServicesFile({ projectRoot, env = {}, exists = existsSync } = {}) {
  const root = projectRoot ?? process.cwd();

  for (const name of GOOGLE_SERVICES_ENV_NAMES) {
    const value = env[name];
    if (!value) continue;
    const candidate = isAbsolute(value) ? value : resolve(root, value);
    if (exists(candidate)) {
      return candidate;
    }
    console.warn(
      `[app.config] ${name} indică spre "${value}", dar fișierul nu există. ` +
        `Se folosește ${DEFAULT_GOOGLE_SERVICES_PATH} (și prebuild-ul se va opri dacă nici acesta nu există).`,
    );
  }

  return DEFAULT_GOOGLE_SERVICES_PATH;
}

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: resolveGoogleServicesFile({
      projectRoot: process.env.EXPO_PROJECT_ROOT ?? process.cwd(),
      env: process.env,
    }),
  },
});

module.exports.DEFAULT_GOOGLE_SERVICES_PATH = DEFAULT_GOOGLE_SERVICES_PATH;
module.exports.GOOGLE_SERVICES_ENV_NAMES = GOOGLE_SERVICES_ENV_NAMES;
module.exports.resolveGoogleServicesFile = resolveGoogleServicesFile;
