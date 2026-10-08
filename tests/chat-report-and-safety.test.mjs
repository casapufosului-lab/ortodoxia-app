/**
 * T10 (audit: A7 + B5 + C7) — raportarea răspunsurilor AI și regulile de siguranță ale asistentului.
 *
 * Ce dovedesc testele:
 *   A. promptul livrat conține FIECARE regulă obligatorie și fiecare verificare este sensibilă
 *      (scoasă regula, verificarea o raportează) — exact cerința „schimbi promptul, cade poarta";
 *   B. cererea către OpenAI chiar trimite promptul, cu `safety_identifier` și `store: false`;
 *   C. calea de raportare există cap-coadă: buton doar la răspunsurile asistentului, scriere în
 *      `ai_reports`, mesaj explicit la eșec, dialog `Alert`;
 *   D. migrația tabelului `ai_reports` are RLS, `default auth.uid()`, politică de inserare proprie,
 *      `anon` fără drepturi și NICIO politică de update/delete (un raport nu poate fi șters de cel
 *      care l-a trimis);
 *   E. cheile de interfață există în toate cele 10 limbi (un ecran nou fără traduceri e un ecran
 *      rupt în 9 limbi);
 *   F. lista de coloane cerute de `scripts/schema-checks.mjs` acoperă ce scrie clientul (altfel
 *      schema reală poate rămâne în urmă fără ca cineva să afle — incidentul `last_request_at`);
 *   G. procesul de moderare este documentat acolo unde îl caută poarta.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CHAT_FUNCTION,
  CHAT_SCREEN,
  MODERATION_DOC,
  REPORTS_MIGRATION,
  REQUIRED_RULES,
  analyse,
  deliveryProblems,
  extractPrompt,
  missingRules,
  reportPathProblems,
  withoutRule,
} from '../scripts/chat-safety-rules.mjs';
import { REQUIRED_COLUMNS } from '../scripts/schema-checks.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const chatFunction = read('supabase/functions/orthodox-chat/index.ts');
const prompt = extractPrompt(chatFunction);

test('A. promptul livrat conține toate regulile obligatorii', () => {
  assert.notEqual(prompt, null, 'șirul `systemInstructions` trebuie să existe în funcția Edge');
  assert.deepEqual(missingRules(prompt), [], 'nicio regulă obligatorie nu are voie să lipsească');
});

test('A2. fiecare regulă este verificată de o poartă sensibilă', () => {
  for (const rule of REQUIRED_RULES) {
    const mutated = withoutRule(prompt, rule);
    assert.notEqual(mutated, prompt, `regula ${rule.id} trebuie să aibă o linie proprie de scos`);
    assert.ok(
      missingRules(mutated).includes(rule.id),
      `dacă regula ${rule.id} dispare din prompt, verificarea trebuie s-o raporteze`,
    );
    // și nu produce zgomot pentru regulile care au rămas
    const others = missingRules(mutated).filter((id) => id !== rule.id);
    assert.deepEqual(others, [], `scoaterea regulii ${rule.id} nu trebuie să semnaleze alte reguli`);
  }
});

test('A3. verificarea întreagă trece pe fișierele reale', () => {
  assert.deepEqual(analyse(), []);
});

test('B. cererea către OpenAI trimite promptul și identificatorul de siguranță', () => {
  assert.match(chatFunction, /instructions:\s*systemInstructions/);
  assert.deepEqual(deliveryProblems(chatFunction), []);
});

test('B2. lipsa unei bucăți din cerere este raportată (nu doar presupusă)', () => {
  const broken = chatFunction
    .replace('safety_identifier: user.id,', '')
    .replace('store: false,', '');
  const problems = deliveryProblems(broken);
  assert.equal(problems.length, 2);
  assert.ok(problems.some((problem) => problem.includes('safety_identifier')));
  assert.ok(problems.some((problem) => problem.includes('store: false')));
});

test('C. butonul de raportare există și doar sub răspunsurile asistentului', () => {
  const chatScreen = read('src/app/(tabs)/chat.tsx');
  assert.match(chatScreen, /from\('ai_reports'\)[\s\S]{0,60}?\.insert\(/);
  assert.match(chatScreen, /message\.role === 'assistant'/);
  assert.match(chatScreen, /t\('chat\.reportButton'\)/);
  // eșecul trebuie spus, nu înghițit
  assert.match(chatScreen, /catch \{[\s\S]{0,300}?t\('chat\.reportFailed'\)/);
  // duplicatul (23505) nu este o eroare pentru utilizator
  assert.match(chatScreen, /error\.code !== '23505'/);
  // un raport trimis nu mai poate fi trimis a doua oară din același ecran
  assert.match(chatScreen, /reportedMessageIds\.includes\(message\.id\)/);
});

test('C2. ștergerea unei linii din calea de raportare este raportată', () => {
  const chatScreen = read('src/app/(tabs)/chat.tsx');
  const problems = reportPathProblems({
    chatScreen: chatScreen.replace(/t\('chat\.reportFailed'\)/, "''"),
    migration: read('supabase/migrations/20261008000200_add_ai_reports.sql'),
    moderationDoc: read('docs/MODERARE-CONTINUT-AI.md'),
  });
  assert.ok(
    problems.some((problem) => problem.includes('eșecul raportării')),
    'lipsa mesajului de eroare trebuie să fie o problemă a porții',
  );
});

test('D. migrația creează tabelul cu RLS, politică proprie și fără update/delete', () => {
  assert.ok(existsSync(REPORTS_MIGRATION), 'migrația trebuie să existe');
  const migration = read('supabase/migrations/20261008000200_add_ai_reports.sql');
  assert.match(migration, /create table if not exists public\.ai_reports/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /user_id uuid not null default auth\.uid\(\)/i);
  assert.match(migration, /for insert\s+to authenticated\s+with check \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(migration, /revoke all on public\.ai_reports from anon/i);
  assert.equal(/for update|for delete/i.test(migration), false, 'un raport trimis nu se modifică/șterge de client');
  // coloanele scrise de client trebuie să existe în tabel
  for (const column of ['reason', 'message_text', 'thread_id', 'app_language']) {
    assert.match(migration, new RegExp(`^\\s*${column} `, 'm'), `${column} lipsește din tabel`);
  }
  // coada de moderare: stările documentate în migrație și în docs/
  assert.match(migration, /status text not null default 'open' check \(status in \('open', 'reviewed', 'dismissed'\)\)/);
});

test('E. cheile de raportare există în toate cele 10 limbi', () => {
  const config = read('src/i18n/config.ts');
  const locales = ['ro', 'en', 'el', 'sr', 'bg', 'mk', 'uk', 'ka', 'ru', 'sq'];
  const keys = [
    'chat.reportButton',
    'chat.reportMessage',
    'chat.reportReasonOffensive',
    'chat.reportReasonWrong',
    'chat.reportCancel',
    'chat.reportSent',
    'chat.reportFailed',
  ];
  for (const locale of locales) {
    const start = config.indexOf(`const ${locale} = {`);
    assert.ok(start > 0, `blocul limbii ${locale} trebuie să existe`);
    const nextLocale = locales[locales.indexOf(locale) + 1];
    const end = nextLocale ? config.indexOf(`const ${nextLocale} = {`, start) : config.length;
    const block = config.slice(start, end);
    for (const key of keys) {
      assert.ok(block.includes(`'${key}':`), `${key} lipsește din limba ${locale}`);
    }
  }
});

test('F. lista de coloane cerute de la schema reală acoperă ce scrie clientul', () => {
  assert.ok(REQUIRED_COLUMNS.ai_reports, 'tabelul ai_reports trebuie verificat față de schema reală');
  for (const column of ['user_id', 'reason', 'message_text', 'thread_id', 'app_language', 'status', 'created_at']) {
    assert.ok(REQUIRED_COLUMNS.ai_reports.includes(column), `ai_reports.${column} este scris de client`);
  }
});

test('G. procesul de moderare este documentat', () => {
  assert.ok(existsSync(MODERATION_DOC), 'docs/MODERARE-CONTINUT-AI.md trebuie să existe');
  const doc = read('docs/MODERARE-CONTINUT-AI.md');
  assert.match(doc, /ai_reports/);
  assert.match(doc, /open/);
  assert.match(doc, /reviewed/);
  // câte zile până când un raport este citit (promisiune verificabilă)
  assert.match(doc, /zile lucrătoare/);
});

test('G2. poarta care apără toate acestea este înregistrată în safety gate', () => {
  const gate = read('scripts/safety-gate.mjs');
  assert.match(gate, /chat-safety-rules\.mjs/);
  assert.match(gate, /--self-test/);
  assert.ok(existsSync(CHAT_FUNCTION) && existsSync(CHAT_SCREEN));
});
