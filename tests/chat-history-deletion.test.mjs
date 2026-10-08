/**
 * B2 (registru, high) — istoricul de chat al utilizatorului neautentificat nu se ștergea niciodată.
 *
 * Poziția din audit: `src/lib/supabase.ts` creează o sesiune anonimă REALĂ (signInAnonymously),
 * deci transcrierile unui oaspete stau sub un `auth.users.id` adevărat și rămân acolo la infinit.
 * `delete-account` șterge doar contul autentificat, iar oaspetele nu are niciun buton prin care să-și
 * șteargă conversația de pe dispozitiv.
 *
 * Testul de față apără AMBELE jumătăți care țin de cod:
 *   1. modulul `src/lib/chat-history.ts` — ștergerea se face pe `chat_threads` (mesajele cad prin
 *      cascadă `on delete cascade`, pentru că `chat_messages` NU are politică de DELETE pentru client);
 *   2. ecranul de chat — butonul există, cere confirmare, pornește sesiunea de oaspete dacă lipsește
 *      și golește conversația din memorie.
 *
 * Testele sunt comportamentale: importă modulul real și îl rulează pe un client fals. Nu verifică
 * textul sursei acolo unde se poate verifica o ieșire.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  ChatHistoryDeletionError,
  deleteChatHistoryForSession,
  shouldOfferChatHistoryDeletion,
} from '../src/lib/chat-history.ts';

const chatScreen = readFileSync('src/app/(tabs)/chat.tsx', 'utf8');
const i18nConfig = readFileSync('src/i18n/config.ts', 'utf8');

/** Client fals, cu aceeași formă pe care modulul are voie să o folosească. */
function fakeClient({ session = null, deleteRows = [], deleteError = null, sessionError = null } = {}) {
  const calls = { from: [], eq: [], select: [], deleteCount: 0 };
  const client = {
    auth: {
      async getSession() {
        return { data: { session }, error: sessionError };
      },
    },
    from(table) {
      calls.from.push(table);
      return {
        delete() {
          calls.deleteCount += 1;
          return {
            eq(column, value) {
              calls.eq.push([table, column, value]);
              return {
                async select(columns) {
                  calls.select.push([table, columns]);
                  return { data: deleteError ? null : deleteRows, error: deleteError };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

test('șterge firele sesiunii curente și raportează câte au fost șterse', async () => {
  const { client, calls } = fakeClient({
    session: { user: { id: 'guest-1' } },
    deleteRows: [{ id: 'a' }, { id: 'b' }],
  });

  const result = await deleteChatHistoryForSession(client);

  assert.equal(result.hadSession, true);
  assert.equal(result.deletedThreads, 2);
  assert.deepEqual(calls.from, ['chat_threads'], 'doar chat_threads se atinge direct');
  assert.deepEqual(calls.eq, [['chat_threads', 'user_id', 'guest-1']], 'ștergerea e legată de id-ul sesiunii');
});

test('NU încearcă să șteargă direct chat_messages (nu există politică de DELETE pe tabelă)', () => {
  // Motivul e citit din migrația inițială: chat_messages are doar politici de select și insert, deci
  // o ștergere directă de client ar fi refuzată de RLS. Mesajele trebuie să cadă prin cascadă
  // (chat_messages.thread_id → chat_threads.id on delete cascade).
  const schema = readFileSync('supabase/migrations/20260829000100_initial_schema.sql', 'utf8');
  const messagesBlock = schema.slice(schema.indexOf('create table public.chat_messages'));
  const messagesDdl = messagesBlock.slice(0, messagesBlock.indexOf('create index'));
  assert.match(messagesDdl, /thread_id uuid not null references public\.chat_threads\(id\) on delete cascade/);

  const policies = schema.slice(schema.indexOf('create policy "messages_select_own_thread"'));
  assert.equal(
    /on public\.chat_messages for delete/.test(policies),
    false,
    'dacă apare o politică de DELETE pe chat_messages, revizuiește modulul',
  );
  assert.equal(chatScreen.includes("from('chat_messages').delete"), false, 'ecranul nu șterge mesaje direct');
});

test('fără sesiune nu atinge baza și nu aruncă', async () => {
  const { client, calls } = fakeClient({ session: null });

  const result = await deleteChatHistoryForSession(client);

  assert.deepEqual(result, { hadSession: false, deletedThreads: 0 });
  assert.equal(calls.deleteCount, 0, 'clientul nu a fost folosit deloc');
});

test('o eroare de bază se propagă, ca ecranul să poată spune că nu s-a șters', async () => {
  const { client } = fakeClient({
    session: { user: { id: 'u-9' } },
    deleteError: { message: 'permission denied', code: '42501' },
  });

  await assert.rejects(
    () => deleteChatHistoryForSession(client),
    (error) => {
      assert.ok(error instanceof ChatHistoryDeletionError, 'tip propriu, ca ecranul să-l poată recunoaște');
      assert.equal(error.code, '42501');
      return true;
    },
  );
});

test('id-ul de șters nu poate veni din afară, doar din sesiune', () => {
  // Semnătura are exact un parametru: nu există portiță prin care un apelant să ceară ștergerea
  // altcuiva, chiar dacă RLS ar refuza oricum.
  assert.equal(deleteChatHistoryForSession.length, 1);
});

test('butonul de ștergere apare doar când chiar există o conversație', () => {
  assert.equal(shouldOfferChatHistoryDeletion([], null), false);
  assert.equal(shouldOfferChatHistoryDeletion([{ id: 'welcome', role: 'assistant' }], null), false);
  assert.equal(shouldOfferChatHistoryDeletion([{ id: 'welcome', role: 'assistant' }, { id: 'm1', role: 'user' }], null), true);
  assert.equal(shouldOfferChatHistoryDeletion([{ id: 'welcome', role: 'assistant' }], 'thread-1'), true);
});

test('ecranul de chat folosește modulul, confirmă și golește conversația', () => {
  assert.match(chatScreen, /import \{[^}]*deleteChatHistoryForSession[^}]*\} from '@\/lib\/chat-history'/);
  assert.match(chatScreen, /shouldOfferChatHistoryDeletion\(/);
  assert.match(chatScreen, /t\('chat\.clearHistoryTitle'\)/);
  assert.match(chatScreen, /t\('chat\.clearHistoryConfirm'\)/);
  assert.match(chatScreen, /style: 'destructive'/);
  assert.match(chatScreen, /t\('chat\.clearHistoryDone'\)/);
  assert.match(chatScreen, /t\('chat\.clearHistoryFailed'\)/);
  // Oaspetele trebuie să aibă o sesiune înainte de ștergere, altfel RLS nu are cui să dea voie.
  assert.match(chatScreen, /if \(!user\) await ensureGuestChatSession\(\);/);
  assert.match(chatScreen, /const client = user \? supabase : chatGuestSupabase;/);
  // După ștergere conversația se golește în memorie, nu rămâne pe ecran.
  assert.match(chatScreen, /setMessages\(\[welcomeMessage\(t\)\]\)/);
  assert.match(chatScreen, /setThreadId\(null\)/);
  assert.match(chatScreen, /setReportedMessageIds\(\[\]\)/);
});

test('butonul de ștergere e o țintă accesibilă de minimum 44 de puncte', () => {
  const style = chatScreen.slice(chatScreen.indexOf('clearHistory: {'));
  const block = style.slice(0, style.indexOf('}'));
  assert.match(block, /minHeight: 44/);
  assert.match(chatScreen, /accessibilityRole="button"[\s\S]{0,400}clearChatHistory/);
});

test('cele 6 texte există în toate cele 10 limbi, fără caractere stricate', () => {
  const keys = [
    'chat.clearHistoryButton',
    'chat.clearHistoryTitle',
    'chat.clearHistoryMessage',
    'chat.clearHistoryConfirm',
    'chat.clearHistoryDone',
    'chat.clearHistoryFailed',
  ];

  for (const key of keys) {
    const occurrences = i18nConfig.split(`'${key}':`).length - 1;
    assert.equal(occurrences, 10, `${key} apare în ${occurrences} limbi, nu în 10`);

    const values = i18nConfig
      .split(/\r?\n/)
      .filter((line) => line.includes(`'${key}':`))
      .map((line) => line.slice(line.indexOf(`'${key}':`) + key.length + 3).trim());

    assert.equal(values.length, 10);
    for (const value of values) {
      assert.equal(value.includes('\uFFFD'), false, `${key}: caracter de înlocuire în ${value}`);
      assert.ok(value.length > 2, `${key}: text gol`);
    }
    assert.equal(new Set(values).size >= 8, true, `${key}: traducerile nu par traduse (prea puține distincte)`);
  }
});
