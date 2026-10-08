/**
 * T9 din auditul de dinainte de lansare — pozițiile B7 (politica din aplicație nu
 * respecta art. 13 GDPR) și B9 (contul se crea fără acceptarea termenilor).
 *
 * Ce apără testul:
 *  - cele 10 limbi au toate cheile noi (fără ele, un utilizator grec sau georgian ar
 *    vedea text românesc prin fallback, iar paritatea dicționarelor e o regulă a proiectului);
 *  - textul acoperă informațiile cerute de art. 13: temei legal, durate de păstrare,
 *    transferuri în afara SEE, lista drepturilor, retragerea consimțământului,
 *    autoritatea de supraveghere, lipsa deciziilor automatizate;
 *  - ecranul de confidențialitate randează secțiunile noi;
 *  - ecranul de autentificare cere bifa la creare de cont, blochează trimiterea fără ea,
 *    salvează momentul acceptării și NU cere bifa la autentificare.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const CONFIG = readFileSync(new URL('../src/i18n/config.ts', import.meta.url), 'utf8');
const PRIVACY = readFileSync(new URL('../src/app/privacy.tsx', import.meta.url), 'utf8');
const AUTH = readFileSync(new URL('../src/app/auth.tsx', import.meta.url), 'utf8');

const LOCALES = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];

const NEW_KEYS = [
  'privacy.s11Title',
  'privacy.s11Content',
  'privacy.s12Title',
  'privacy.s12Content',
  'auth.termsCheckbox',
  'auth.termsRequired',
  'auth.termsRequiredTitle',
];

/** Textul blocului `const <limba> = { ... }`, cu acoladele echilibrate. */
function localeBlock(locale) {
  const start = CONFIG.indexOf(`const ${locale} = {`);
  assert.ok(start > 0, `blocul const ${locale} = { lipsește`);

  let depth = 0;
  let end = start;
  for (let i = CONFIG.indexOf('{', start); i < CONFIG.length; i += 1) {
    const ch = CONFIG[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    } else if (ch === "'" || ch === '"') {
      const quote = ch;
      i += 1;
      while (i < CONFIG.length && CONFIG[i] !== quote) {
        if (CONFIG[i] === '\\') i += 1;
        i += 1;
      }
    }
  }
  return CONFIG.slice(start, end);
}

/** Valoarea brută a unei chei (cu `\n` scăpat, cum e în fișier). */
function rawValue(locale, key) {
  const block = localeBlock(locale);
  const at = block.indexOf(`'${key}':`);
  assert.ok(at > 0, `${locale} nu are cheia ${key}`);
  const from = block.indexOf("'", block.indexOf(':', at) + 1);
  const to = block.indexOf("',", from + 1);
  assert.ok(to > from, `${locale}.${key} nu are valoare închisă corect`);
  return block.slice(from + 1, to);
}

test('toate cele 10 limbi au cheile legale noi (B7 + B9)', () => {
  for (const locale of LOCALES) {
    for (const key of NEW_KEYS) {
      const value = rawValue(locale, key);
      assert.ok(value.trim().length > 0, `${locale}.${key} e gol`);
    }
  }
});

test('cheile noi nu sunt doar copii ale românei în celelalte limbi', () => {
  // Semn de text netradus: valoarea identică cu cea românească la o frază lungă.
  for (const key of ['privacy.s11Title', 'privacy.s12Title', 'auth.termsRequired']) {
    const ro = rawValue('ro', key);
    for (const locale of LOCALES.filter((code) => code !== 'ro')) {
      assert.notEqual(rawValue(locale, key), ro, `${locale}.${key} pare netradus (identic cu ro)`);
    }
  }
});

test('secțiunea 11 acoperă temeiul legal, păstrarea și transferurile (art. 13 alin. 1)', () => {
  const ro = rawValue('ro', 'privacy.s11Content');
  assert.match(ro, /art\. 6 GDPR/, 'lipsește temeiul legal');
  assert.match(ro, /contract/i, 'lipsește executarea contractului');
  assert.match(ro, /consimțământ/i, 'lipsește consimțământul');
  assert.match(ro, /interesul legitim/i, 'lipsește interesul legitim');
  assert.match(ro, /Durata păstrării/i, 'lipsesc duratele de păstrare');
  assert.match(ro, /SEE|Spațiul Economic European/i, 'lipsește zona de transfer');
  assert.match(ro, /clauze\w* contractual\w* standard/i, 'lipsesc garanțiile transferului');

  // Aceleași noțiuni trebuie să existe în engleză, ca textul de referință să rămână paralel.
  const en = rawValue('en', 'privacy.s11Content');
  assert.match(en, /Art\. 6 GDPR/);
  assert.match(en, /Retention/i);
  assert.match(en, /standard contractual clauses/i);
});

test('secțiunea 12 enumeră drepturile, retragerea consimțământului și autoritatea (art. 13 alin. 2)', () => {
  const ro = rawValue('ro', 'privacy.s12Content');
  for (const right of ['acces', 'rectificare', 'ștergere', 'restricționare', 'portabilitate', 'opoziție']) {
    assert.match(ro, new RegExp(right, 'i'), `lipsește dreptul la ${right}`);
  }
  assert.match(ro, /retrage consimțământul oricând/i, 'lipsește retragerea consimțământului');
  assert.match(ro, /nu ia decizii automatizate/i, 'lipsește precizarea despre deciziile automatizate');
  assert.match(ro, /ANSPDCP/, 'lipsește autoritatea de supraveghere');
  assert.match(ro, /dataprotection\.ro/, 'lipsește adresa autorității');
  assert.match(ro, /o lună/, 'lipsește termenul de răspuns la cereri');
  assert.match(ro, /\{supportAddress\}/, 'lipsește adresa de contact legală');
});

test('ecranul de confidențialitate randează secțiunile noi', () => {
  assert.match(PRIVACY, /t\('privacy\.s11Title'\)/);
  assert.match(PRIVACY, /t\('privacy\.s11Content'\)/);
  assert.match(PRIVACY, /t\('privacy\.s12Title'\)/);
  assert.match(PRIVACY, /t\('privacy\.s12Content'\)/);
  // Ordinea din ecran: 11 și 12 vin după secțiunea de modificări (s9) și după contact (s10).
  assert.ok(PRIVACY.indexOf("t('privacy.s10Title')") < PRIVACY.indexOf("t('privacy.s11Title')"));
});

test('crearea de cont cere bifa de acceptare, cu rol de checkbox pentru cititoarele de ecran', () => {
  assert.match(AUTH, /accessibilityRole="checkbox"/);
  assert.match(AUTH, /accessibilityState=\{\{ checked: termsAccepted/, 'bifa nu își anunță starea');
  assert.match(AUTH, /t\('auth\.termsCheckbox'\)/, 'bifa nu are etichetă tradusă');
  assert.match(AUTH, /const \[termsAccepted, setTermsAccepted\] = useState\(false\)/);
});

test('trimiterea formularului este blocată fără acceptare, doar la creare de cont', () => {
  assert.match(
    AUTH,
    /if \(activeMode === 'sign-up' && !termsAccepted\) \{\s*showAuthAlert\(t\('auth\.termsRequiredTitle'\), t\('auth\.termsRequired'\)\);\s*return false;/,
    'validarea nu blochează crearea contului fără bifă',
  );
  // Autentificarea unui cont existent nu are voie să ceară bifa.
  assert.doesNotMatch(AUTH, /activeMode === 'sign-in' && !termsAccepted/);
});

test('acceptarea termenilor este înregistrată cu moment și versiune', () => {
  assert.match(AUTH, /terms_accepted_at: termsAcceptedAt/);
  assert.match(AUTH, /terms_version: TERMS_VERSION/);
  assert.match(AUTH, /const termsAcceptedAt = new Date\(\)\.toISOString\(\)/);
  assert.match(AUTH, /const TERMS_VERSION = '\d{4}-\d{2}-\d{2}'/);
});

/**
 * A11: aceeași prelucrare e descrisă în trei locuri — formularul „Data safety" din magazin,
 * politica din aplicație și pagina publicată. Auditul a găsit tokenul de notificare în
 * aplicație, dar lipsă din formular. Testul apără cele două texte care sunt în acest depozit;
 * pagina publicată (proiectul de site) rămâne de regenerat din ele.
 *
 * Condițiile sunt repetate intenționat aici și în `checkDataSafetyAlignment()`: testul apără
 * textul de azi, poarta apără textul înainte de fiecare build. Ambele trebuie să cadă dacă
 * rândul cu tokenul dispare.
 */
test('formularul „Data safety" declară tokenul de notificare și scopul livrării (A11)', () => {
  const kit = readFileSync(new URL('../docs/STORE_SUBMISSION_KIT.md', import.meta.url), 'utf8');
  const from = kit.indexOf('## 4.');
  const to = kit.indexOf('## 5.');
  assert.ok(from > 0 && to > from, 'secțiunea 4 (Data safety) lipsește din kitul de publicare');
  const section = kit.slice(from, to);

  assert.match(section, /Expo Push Token/, 'formularul nu declară tokenul de notificare');
  assert.match(section, /livrarea notific/i, 'formularul nu declară livrarea notificărilor ca scop');
  assert.match(section, /publicitate sau urm/i, 'formularul nu răspunde la întrebarea despre urmărire');
  assert.match(section, /doar\*\* dacă utilizatorul activează notificările/i, 'nu se spune că tokenul e opțional');

  // Politica din aplicație trebuie să spună același lucru (tokenul e descris în privacy.s2_5Content).
  assert.match(CONFIG, /Expo Push Token/, 'politica din aplicație nu mai descrie tokenul de notificare');
});

test('poarta de release verifică potrivirea dintre formular și politica din aplicație (A11)', () => {
  const gate = readFileSync(new URL('../scripts/release-readiness.mjs', import.meta.url), 'utf8');
  assert.match(gate, /function checkDataSafetyAlignment\(\)/);
  assert.match(gate, /^\s*checkDataSafetyAlignment\(\);/m, 'verificarea nu este înregistrată în main()');
});
