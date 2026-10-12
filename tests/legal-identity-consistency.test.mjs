/**
 * C1 — o singură identitate a operatorului, peste tot (12.10.2026).
 *
 * Politica de confidențialitate există în trei locuri (aplicație, Play, Apple) și
 * operatorul e scris, în practică, în cinci fișiere. Până acum valorile puteau
 * diverge în tăcere: `eas.json` (build EAS), `codemagic.yaml` (build CI), cele două
 * workflow-uri GitHub (workflow-uri dezactivate, dar re-activabile) și `.env`-ul local
 * scriu fiecare propriul `.env` pentru Expo.
 *
 * Testele de aici NU fixează numele vreunei firme (se schimbă doar în cinci locuri,
 * deodată, când se schimbă operatorul) — verifică TREI lucruri durabile:
 *   1. toate copiile spun aceeași identitate, iar niciuna nu a rămas cu un placeholder;
 *   2. identitatea identifică operatorul (CUI + număr de înregistrare), nu doar un nume;
 *   3. textul politicii din aplicație randează operatorul din configurație
 *      (`{legalEntity}`) în TOATE limbile, și nu mai există nicăieri formularea
 *      „conținutul rămas este anonimizat" — la ștergerea contului, conversațiile
 *      se șterg (`supabase/functions/delete-account/core.ts`), nu se anonimizează.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** Fișiere care scriu fiecare propriul `.env` pentru Expo. */
const ENV_COPIES = [
  '.env.example',
  'codemagic.yaml',
  '.github/workflows/ci.yml',
  '.github/workflows/ios-verify.yml',
];

/** `.env` e local (gitignored); dacă există, trebuie să spună același lucru. */
const LOCAL_ENV = '.env';

const KEYS = [
  'EXPO_PUBLIC_LEGAL_ENTITY',
  'EXPO_PUBLIC_SUPPORT_EMAIL',
  'EXPO_PUBLIC_LEGAL_POSTAL_ADDRESS',
  'EXPO_PUBLIC_LEGAL_JURISDICTION',
  'EXPO_PUBLIC_LEGAL_LOCALITY',
];

const PLACEHOLDER = /^(your_|\[|<|CHANGEME|TODO|REPLACE|xxx)/i;

/** Identitatea de persoană fizică, retrasă la 12.10.2026 (C0/C1). */
const RETIRED = ['Ștefan Ștefan', 'Rm. Vâlcea'];

function emptyMap() {
  return new Map(KEYS.map((key) => [key, []]));
}

/** `KEY=valoare` sau `KEY: valoare` (codemagic.yaml, workflow-uri, .env). */
function valuesFromAssignments(text) {
  const found = emptyMap();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:-\s*)?(EXPO_PUBLIC_[A-Z_]+)\s*[=:]\s*(.+?)\s*$/.exec(line);
    if (!match || !found.has(match[1])) continue;
    found.get(match[1]).push(match[2].replace(/^["']/, '').replace(/["'],?$/, '').trim());
  }
  return found;
}

/** `"KEY": "valoare"` în fiecare profil de build din eas.json. */
function valuesFromEasJson(text) {
  const found = emptyMap();
  const json = JSON.parse(text);
  for (const profile of Object.values(json.build ?? {})) {
    for (const [key, value] of Object.entries(profile?.env ?? {})) {
      if (found.has(key)) found.get(key).push(String(value));
    }
  }
  return found;
}

/** Toate copiile, cu valorile găsite în fiecare. */
function copies() {
  const files = [
    { file: 'eas.json', values: valuesFromEasJson(read('eas.json')) },
    ...ENV_COPIES.map((file) => ({ file, values: valuesFromAssignments(read(file)) })),
  ];
  if (existsSync(join(ROOT, LOCAL_ENV))) {
    files.push({ file: LOCAL_ENV, values: valuesFromAssignments(read(LOCAL_ENV)) });
  }
  return files;
}

test('fiecare copie a identității legale conține toate cele cinci valori', () => {
  for (const { file, values } of copies()) {
    for (const key of KEYS) {
      assert.ok(
        values.get(key).length > 0,
        `${file}: lipsește ${key} — build-ul ar porni cu identitatea incompletă`,
      );
    }
  }
});

test('toate copiile spun aceeași identitate (fără divergențe tăcute)', () => {
  const seen = new Map(KEYS.map((key) => [key, new Map()]));
  for (const { file, values } of copies()) {
    for (const key of KEYS) {
      for (const value of values.get(key)) {
        if (!seen.get(key).has(value)) seen.get(key).set(value, []);
        seen.get(key).get(value).push(file);
      }
    }
  }
  for (const key of KEYS) {
    const variants = [...seen.get(key).keys()];
    assert.equal(
      variants.length,
      1,
      `${key} are ${variants.length} variante: ${variants
        .map((value) => `"${value}" (${[...new Set(seen.get(key).get(value))].join(', ')})`)
        .join(' vs ')}`,
    );
  }
});

test('nicio copie nu a rămas cu un placeholder de completat', () => {
  for (const { file, values } of copies()) {
    for (const key of KEYS) {
      for (const value of values.get(key)) {
        assert.ok(
          !PLACEHOLDER.test(value),
          `${file}: ${key} încă e un placeholder („${value}") — ar ajunge în politica publicată`,
        );
      }
    }
  }
});

test('operatorul e identificat: denumire + CUI + număr de înregistrare', () => {
  const entity = valuesFromEasJson(read('eas.json')).get('EXPO_PUBLIC_LEGAL_ENTITY')[0];
  assert.match(entity, /[A-Za-zĂÂÎȘȚăâîșț]/, 'denumirea operatorului lipsește');
  assert.match(entity, /CUI\s*:?\s*\d{6,10}/i, `lipsește CUI-ul din identitatea „${entity}"`);
  assert.match(
    entity,
    /(Reg\.?\s*Com\.?|J\s*\d{6,})/i,
    `lipsește numărul de înregistrare (Reg. Com.) din identitatea „${entity}"`,
  );
});

test('toate copiile au aceeași adresă de suport și identitatea din aplicație', () => {
  const data = copies();
  const eas = valuesFromEasJson(read('eas.json'));
  for (const { file, values } of data) {
    for (const key of KEYS) {
      assert.deepEqual(
        [...new Set(values.get(key))],
        [...new Set(eas.get(key))],
        `${file}: ${key} diferă de eas.json`,
      );
    }
  }
});

test('identitatea de persoană fizică retrasă nu mai apare în nicio copie', () => {
  for (const { file, values } of copies()) {
    for (const key of KEYS) {
      for (const value of values.get(key)) {
        for (const retired of RETIRED) {
          assert.ok(
            !value.includes(retired),
            `${file}: ${key} încă spune „${retired}" (operatorul e altul din 12.10.2026)`,
          );
        }
      }
    }
  }
});

test('politica din aplicație randează operatorul din configurație, în toate limbile', () => {
  const config = read('src/i18n/config.ts');
  for (const key of ['privacy.s1Entity', 'terms.s1Entity']) {
    const pattern = new RegExp(`'${key.replace('.', '\\.')}':\\s*'([^']*)'`, 'g');
    const rendered = [...config.matchAll(pattern)].map((match) => match[1]);
    assert.ok(rendered.length >= 10, `${key}: doar ${rendered.length} limbi (aștept cel puțin 10)`);
    for (const value of rendered) {
      assert.equal(
        value,
        '{legalEntity}',
        `${key}: „${value}" nu randează operatorul din configurație — textul poate diverge de copiile de build`,
      );
    }
  }
});

test('politica nu mai afirmă că datele rămase se anonimizează la ștergerea contului', () => {
  const config = read('src/i18n/config.ts');
  assert.ok(
    !/anonimiz|anonymis|anonymiz/i.test(config),
    'politica din aplicație conține o afirmație de anonimizare; la ștergerea contului conversațiile se ȘTERG',
  );
});
