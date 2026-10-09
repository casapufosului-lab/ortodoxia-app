/**
 * Mesajele de cotă, în toate cele 10 limbi (limitele AI din 20260923000100).
 *
 * Ce dovedesc testele:
 *   A. fiecare limbă are cele 5 mesaje, traduse efectiv (nu română copiată, fără placehoală goală);
 *   B. codurile pe care serverul le poate întoarce sunt EXACT cele pe care clientul le localizează;
 *   C. clientul preferă traducerea și păstrează textul serverului doar ca rezervă (cod necunoscut);
 *   D. cooldown-ul (temporar) NU golește contorul, spre deosebire de codurile de epuizare.
 *
 * Corpusul este citit direct din `src/i18n/config.ts` (blocurile `const <limbă> = { … }`), nu importat:
 * modulul folosește importuri fără extensie, specifice bundler-ului, pe care Node nu le poate rezolva.
 * Validarea completă a corpusului (paritate de chei, scripturi) rămâne `npm run test:i18n`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const KEYS = ['quotaCooldown', 'quotaDailyLimit', 'quotaClientLimit', 'quotaIpLimit', 'quotaMonthlyCap'];
const LOCALES = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];

const config = readFileSync(resolve('src/i18n/config.ts'), 'utf8');
const endpoint = readFileSync(resolve('supabase/functions/orthodox-chat/index.ts'), 'utf8');
const chat = readFileSync(resolve('src/app/(tabs)/chat.tsx'), 'utf8');

/**
 * Extrage `chat.quota*` din blocul unei limbi.
 *
 * Blocul este delimitat de începutul URMĂTORULUI dicționar, nu de marcajul `satisfies`: dicționarul de
 * referință nu poartă acel marcaj, deci căutarea lui ar fi înghițit două limbi deodată (și prima ar fi
 * părut „netradusă", fiind de fapt suprascrisă de a doua).
 */
const DICTIONARY_STARTS = LOCALES.map((locale) => {
  const at = config.indexOf(`const ${locale} = {`);
  assert.ok(at >= 0, `dicționarul limbii ${locale} trebuie să existe`);
  return at;
});

function quotaMessages(locale) {
  const index = LOCALES.indexOf(locale);
  const start = DICTIONARY_STARTS[index];
  const end = index + 1 < LOCALES.length ? DICTIONARY_STARTS[index + 1] : config.length;
  const block = config.slice(start, end);
  const found = {};
  for (const key of KEYS) {
    const match = new RegExp(`'chat\\.${key}': '((?:[^'\\\\]|\\\\.)*)'`).exec(block);
    if (match !== null) found[key] = match[1];
  }
  return found;
}

test('A. fiecare limbă are cele 5 mesaje de cotă, traduse', () => {
  assert.match(config, /export const SUPPORTED_LANGUAGES = \['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'\] as const;/);
  const romanian = quotaMessages('ro');
  for (const locale of LOCALES) {
    const messages = quotaMessages(locale);
    for (const key of KEYS) {
      const value = messages[key];
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${locale}.${key} lipsește sau e gol`);
      assert.equal(value.includes('{'), false, `${locale}.${key} nu are voie să conțină placeholdere`);
    }
    assert.equal(new Set(KEYS.map((key) => messages[key])).size, KEYS.length, `${locale}: mesajele trebuie să fie distincte între ele`);
    if (locale !== 'ro') {
      for (const key of KEYS) {
        assert.notEqual(messages[key], romanian[key], `${locale}.${key} este netradus (identic cu româna)`);
      }
    }
  }
});

test('A. fiecare mesaj spune ce se întâmplă: dispozitiv, rețea, buget lunar', () => {
  // Verificare de sens, nu doar de formă: fiecare limbă trebuie să pomenească cele trei situații.
  const expectations = {
    quotaCooldown: /(second|secund|δευτερ|секунд|წამ|sekond)/i,
    quotaMonthlyCap: /(month|lun|μην|месец|месеч|місяц|месяц|თვი|muaj)/i,
  };
  for (const locale of LOCALES) {
    const messages = quotaMessages(locale);
    assert.match(messages.quotaCooldown, expectations.quotaCooldown, `${locale}.quotaCooldown nu pomenește secundele`);
    assert.match(messages.quotaMonthlyCap, expectations.quotaMonthlyCap, `${locale}.quotaMonthlyCap nu pomenește luna`);
  }
});

test('B. codurile serverului sunt EXACT cele pe care clientul le localizează', () => {
  const reasons = /const DENIAL_REASONS = \[([^\]]+)\]/.exec(endpoint)?.[1] ?? '';
  const serverCodes = [...reasons.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]).sort();
  const clientCodes = [...chat.matchAll(/^ {2}([a-z_]+): 'chat\.quota[A-Za-z]+',$/gm)].map((match) => match[1]).sort();
  assert.deepEqual(serverCodes, ['client_limit', 'cooldown', 'daily_limit', 'ip_limit', 'monthly_cap']);
  assert.deepEqual(clientCodes, serverCodes, 'un cod nou în server trebuie adăugat și în client');
  // Fiecare cod are o cheie de traducere existentă, în toate limbile.
  const mapped = [...chat.matchAll(/'chat\.(quota[A-Za-z]+)'/g)].map((match) => match[1]).sort();
  assert.deepEqual(mapped, [...KEYS].sort());
});

test('C. clientul folosește traducerea și păstrează textul serverului ca rezervă', () => {
  assert.match(chat, /setErrorMessage\(quotaMessage\(details, typeof details\?\.error === 'string' \? details\.error : t\('chat\.aiResponseError'\), t\)\);/);
  assert.match(
    chat,
    /function quotaMessage\(details: \{ code\?: unknown \} \| null \| undefined, fallback: string, translate: \(key: TranslationKey\) => string\): string \{/,
  );
  assert.match(chat, /return key === undefined \? fallback : translate\(key\);/);
  assert.match(chat, /const key = typeof details\?\.code === 'string' \? QUOTA_MESSAGE_KEYS\[details\.code\] : undefined;/);
});

test('D. cooldown-ul nu golește contorul, codurile de epuizare da', () => {
  const predicate = /function isQuotaExhausted\(code: unknown\): boolean \{\s*\n\s*return ([^;]+);/.exec(chat)?.[1] ?? '';
  for (const code of ['daily_limit', 'client_limit', 'ip_limit', 'monthly_cap']) {
    assert.ok(predicate.includes(`'${code}'`), `${code} trebuie tratat ca epuizare`);
  }
  assert.equal(predicate.includes("'cooldown'"), false, 'cooldown-ul e temporar, contorul rămâne cel de la server');
  // Contractul din server pe care clientul se bazează: cooldown ⇒ remaining > 0.
  assert.match(endpoint, /denialReason === 'cooldown' && \(reservation\.remaining_limit <= 0 \|\| retryAfter < 1\)/);
});
