/**
 * OB.2 — partea de CLIENT a streamingului (09.10.2026).
 *
 * Funcţia Edge trimite acum răspunsul bucată cu bucată, ca server-sent events. Aici se testează
 * direct `src/lib/chat-stream.ts` (modul pur, fără React), fiindcă de el depind exact cerinţele
 * care nu se văd din funcţie:
 *   - textul se afişează pe măsură ce soseşte, chiar dacă reţeaua taie cadrele oriunde;
 *   - eroarea de la mijlocul streamului întoarce un mesaj clar + textul parţial, niciodată o
 *     excepţie care ar lăsa spinnerul veşnic;
 *   - timeout pe INACTIVITATE, nu pe durată: un răspuns lung are voie să dureze, o tăcere lungă nu;
 *   - la final (reuşit, eroare sau cotă refuzată) nu rămâne niciun cronometru în urmă, deci ecranul
 *     poate debloca butonul de trimitere;
 *   - durata până la primul text şi cea totală se MĂSOARĂ, nu se estimează (OB.1).
 *
 * Testele nu ating reţeaua: `fetch` şi ceasul sunt injectate.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHAT_STREAM_IDLE_TIMEOUT_MS,
  CHAT_STREAM_TOTAL_TIMEOUT_MS,
  chatFunctionUrl,
  createInactivityGuard,
  parseSseChunk,
  streamChatReply,
} from '../src/lib/chat-stream.ts';
import { chatLatencyLine, logChatLatency } from '../src/lib/chat-latency.ts';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relPath) => readFileSync(join(REPO, relPath), 'utf8');

/** Comentariile nu sunt cod: altfel un text care doar POMENEŞTE `functions.invoke` ar da alarme false. */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Aceleaşi cadre pe care le trimite funcţia Edge: `event: meta`, bucăţi fără nume, `event: done`. */
const SSE_FRAMES = [
  'event: meta\ndata: {"threadId":"thread-1","remaining":4,"dailyLimit":5}\n\n',
  'data: {"delta":"Bună, "}\n\n',
  'data: {"delta":"acesta "}\n\n',
  'data: {"delta":"este răspunsul."}\n\n',
  'event: done\ndata: {}\n\n',
];
const SSE_FULL = SSE_FRAMES.join('');
const SSE_EXPECTED = [
  { type: 'meta', meta: { threadId: 'thread-1', remaining: 4, dailyLimit: 5 } },
  { type: 'delta', text: 'Bună, ' },
  { type: 'delta', text: 'acesta ' },
  { type: 'delta', text: 'este răspunsul.' },
  { type: 'done' },
];

/** Consumă un text SSE în bucăţi de `size` caractere, exact cum sosesc ele de la reţea. */
function parseInChunks(full, size) {
  const events = [];
  let carry = '';
  for (let index = 0; index < full.length; index += size) {
    const parsed = parseSseChunk(carry, full.slice(index, index + size));
    carry = parsed.carry;
    events.push(...parsed.events);
  }
  return { events, carry };
}

/** Ceas fals: testele dovedesc că duratele vin din ceas, nu din presupuneri. */
function fakeClock() {
  let current = 0;
  return {
    now: () => current,
    advance: (milliseconds) => {
      current += milliseconds;
      return current;
    },
  };
}

/** Cronometre false, ca testul să nu aştepte 30 de secunde şi să poată număra ce s-a programat. */
function fakeTimers() {
  const pending = new Map();
  const scheduled = [];
  let nextId = 1;
  return {
    scheduled,
    timers: {
      schedule: (handler, milliseconds) => {
        const handle = nextId++;
        pending.set(handle, { handler, milliseconds });
        scheduled.push(milliseconds);
        return handle;
      },
      cancel: (handle) => pending.delete(handle),
    },
    /** Declanşează termenul cel mai apropiat (cel mai mic interval programat). */
    fire: () => {
      const next = [...pending.entries()].sort((left, right) => left[1].milliseconds - right[1].milliseconds)[0];
      if (!next) return false;
      pending.delete(next[0]);
      next[1].handler();
      return true;
    },
    pendingCount: () => pending.size,
  };
}

/** Un corp de răspuns care livrează bucăţile una câte una, la cerere (ca un stream real). */
function sseResponse(pieces, { status = 200, headers = {}, onPull } = {}) {
  const encoder = new TextEncoder();
  let index = 0;
  return new Response(new ReadableStream({
    pull(controller) {
      if (onPull) onPull();
      if (index < pieces.length) {
        controller.enqueue(encoder.encode(pieces[index]));
        index += 1;
        return;
      }
      controller.close();
    },
  }), { status, headers: { 'content-type': 'text/event-stream', ...headers } });
}

/** Un corp care nu trimite NIMIC şi care cade când cererea e anulată: exact un model care tace. */
function silentResponse(_url, init) {
  return new Response(new ReadableStream({
    start(controller) {
      init.signal.addEventListener('abort', () => controller.error(new Error('aborted')));
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

const BASE_ARGS = {
  projectUrl: 'https://project.supabase.co',
  apiKey: 'public-key',
  accessToken: async () => 'session-token',
  message: 'question',
  threadId: 'thread-1',
  deviceId: 'device-1234',
};

/** Câteva microtask-uri, ca cererea să apuce să ajungă la `fetch` înainte de a o investiga. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Porneşte o cerere de chat cu `fetch` şi cronometre injectate, DAR fără să o aştepte: unele teste
 * trebuie să acţioneze (să declanşeze cronometrul) în timp ce cererea e încă în curs.
 */
function startChat(options = {}) {
  const seen = [];
  const calls = [];
  const clock = options.clock ?? fakeClock();
  const timersApi = options.timersApi ?? fakeTimers();
  const fetchImpl = options.fetchImpl ?? (async (url, init) => {
    calls.push({ url, init });
    if (options.response) return typeof options.response === 'function' ? options.response(url, init) : options.response;
    return sseResponse(options.pieces ?? SSE_FRAMES, { onPull: () => clock.advance(100) });
  });
  const outcome = streamChatReply({
    ...BASE_ARGS,
    message: options.message ?? BASE_ARGS.message,
    threadId: options.threadId === undefined ? BASE_ARGS.threadId : options.threadId,
    onEvent: (event) => seen.push(event),
    fetchImpl,
    now: clock.now,
    timers: timersApi.timers,
  });
  return { outcome, seen, calls, clock, timersApi };
}

test('cadrele tăiate de reţea în orice punct sunt refăcute exact, în ordine', () => {
  for (const size of [1, 2, 3, 7, 19, 64]) {
    const { events, carry } = parseInChunks(SSE_FULL, size);
    assert.deepEqual(events, SSE_EXPECTED, `bucăţi de ${size} caractere`);
    assert.equal(carry, '', 'la final nu rămâne niciun cadru neterminat');
  }
  // Un singur `read` cu tot corpul dă acelaşi rezultat: parsarea nu depinde de împărţirea reţelei.
  assert.deepEqual(parseSseChunk('', SSE_FULL).events, SSE_EXPECTED);
});

test('un cadru necunoscut ori neinteligibil e ignorat, restul nu se pierde', () => {
  const parsed = parseSseChunk('', 'event: ping\ndata: {"x":1}\n\ndata: rupt\n\ndata: {"delta":"ok"}\n\n');
  assert.deepEqual(parsed.events, [{ type: 'delta', text: 'ok' }]);
  // Contoarele incoerente nu ajung pe ecran (bara de cotă n-are voie să mintă).
  assert.deepEqual(parseSseChunk('', 'event: meta\ndata: {"remaining":4}\n\n').events, []);
});

test('contoarele sosesc înaintea textului, iar duratele se măsoară (nu se estimează)', async () => {
  const { outcome, seen, calls } = startChat();
  const result = await outcome;
  assert.equal(result.kind, 'ok');
  assert.equal(result.text, 'Bună, acesta este răspunsul.');
  // Ordinea de pe ecran: cotă → text → final. Un text fără cotă ar lăsa bara de sus nedefinită.
  assert.equal(seen[0].type, 'meta');
  assert.deepEqual(seen[0].meta, { threadId: 'thread-1', remaining: 4, dailyLimit: 5 });
  assert.deepEqual(seen.slice(1), [
    { type: 'delta', text: 'Bună, ' },
    { type: 'delta', text: 'acesta ' },
    { type: 'delta', text: 'este răspunsul.' },
    { type: 'done' },
  ]);
  // Ceasul fals avansează cu 100 ms la fiecare bucată, deci duratele raportate sunt multipli de 100:
  // dacă modulul ar estima (ori ar raporta 0), testul ar pica.
  assert.ok(result.firstTextMs > 0 && result.firstTextMs % 100 === 0, `primul text: ${result.firstTextMs}`);
  assert.ok(result.totalMs >= result.firstTextMs && result.totalMs % 100 === 0, `total: ${result.totalMs}`);
  // Cererea chiar merge la URL-ul funcţiei, direct (nu prin `functions.invoke`, care ar bufferiza).
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, chatFunctionUrl('https://project.supabase.co'));
  assert.equal(calls[0].url, 'https://project.supabase.co/functions/v1/orthodox-chat');
  assert.equal(calls[0].init.headers.apikey, 'public-key');
  assert.equal(calls[0].init.headers.authorization, 'Bearer session-token');
  assert.equal(calls[0].init.headers['x-device-id'], 'device-1234');
  assert.deepEqual(JSON.parse(calls[0].init.body), { message: 'question', threadId: 'thread-1' });
});

test('eroarea de la mijlocul streamului dă mesaj clar şi păstrează textul deja sosit', async () => {
  const { outcome, seen } = startChat({
    pieces: [
      SSE_FRAMES[0],
      SSE_FRAMES[1],
      'event: error\ndata: {"message":"Serviciul AI nu a răspuns. Încearcă din nou mai târziu."}\n\n',
    ],
  });
  const result = await outcome;
  assert.equal(result.kind, 'stream-error');
  assert.equal(result.failure, 'server');
  assert.equal(result.message, 'Serviciul AI nu a răspuns. Încearcă din nou mai târziu.');
  assert.equal(result.partialText, 'Bună, ', 'textul parţial rămâne pe ecran, nu se pierde');
  assert.equal(seen.at(-1).type, 'error');
  assert.equal(seen.some((event) => event.type === 'done'), false);
});

test('un stream care se închide fără `done` e raportat ca incomplet', async () => {
  const { outcome } = startChat({ pieces: [SSE_FRAMES[0], SSE_FRAMES[1]] });
  const result = await outcome;
  assert.equal(result.kind, 'stream-error');
  assert.equal(result.failure, 'incomplete');
  assert.equal(result.partialText, 'Bună, ');
});

test('un răspuns HTTP de cotă întoarce statusul şi detaliile, ca ecranul să le traducă', async () => {
  const { outcome } = startChat({
    response: new Response(JSON.stringify({ error: 'Așteaptă câteva secunde înainte de următorul mesaj.', code: 'cooldown', remaining: 4, dailyLimit: 5, retryAfter: 3 }), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }),
  });
  const result = await outcome;
  assert.equal(result.kind, 'http');
  assert.equal(result.status, 429);
  assert.equal(result.details.code, 'cooldown');
  assert.equal(result.details.retryAfter, 3);
  assert.equal(result.details.remaining, 4);
});

test('tăcerea prea lungă taie cererea: timeout pe inactivitate, nu pe durată', async () => {
  // Plafoanele livrate: fereastra de inactivitate e mult mai mică decât plafonul total, exact ca un
  // răspuns lung să nu fie tăiat la 30 de secunde.
  assert.ok(CHAT_STREAM_IDLE_TIMEOUT_MS < CHAT_STREAM_TOTAL_TIMEOUT_MS);
  assert.equal(CHAT_STREAM_IDLE_TIMEOUT_MS, 30_000);
  const { outcome, timersApi } = startChat({ response: silentResponse });
  await flush();
  assert.equal(timersApi.pendingCount(), 2, 'inactivitatea + plafonul total');
  assert.equal(timersApi.fire(), true, 'fereastra de inactivitate expiră');
  const result = await outcome;
  assert.equal(result.kind, 'stream-error');
  assert.equal(result.failure, 'timeout');
  assert.equal(timersApi.pendingCount(), 0, 'după oprire nu rămâne niciun cronometru');
});

test('fiecare bucată reîncarcă fereastra de inactivitate, iar la final nu rămâne niciun cronometru', async () => {
  const { outcome, timersApi } = startChat();
  assert.equal((await outcome).kind, 'ok');
  // Un singur termen total ar însemna două programări; reîncărcarea per bucată înseamnă mai multe.
  assert.ok(timersApi.scheduled.length > SSE_FRAMES.length, `s-au reprogramat ${timersApi.scheduled.length} cronometre`);
  assert.deepEqual([...new Set(timersApi.scheduled)].sort((left, right) => left - right),
    [CHAT_STREAM_IDLE_TIMEOUT_MS, CHAT_STREAM_TOTAL_TIMEOUT_MS]);
  assert.equal(timersApi.pendingCount(), 0, 'butonul de trimitere se poate debloca');
});

test('paza de inactivitate se reînarmează şi se opreşte curat', () => {
  const fired = [];
  const timersApi = fakeTimers();
  const guard = createInactivityGuard(500, () => fired.push('timeout'), timersApi.timers);
  guard.bump();
  guard.bump();
  assert.equal(timersApi.pendingCount(), 1, 'un singur cronometru activ, cel reînarmat');
  guard.stop();
  assert.equal(timersApi.pendingCount(), 0);
  assert.equal(timersApi.fire(), false, 'nimic programat nu mai poate declanşa după oprire');
  assert.deepEqual(fired, []);
});

test('o cădere de reţea la trimitere nu aruncă, ci se raportează ca atare', async () => {
  const { outcome } = startChat({
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  const result = await outcome;
  assert.equal(result.kind, 'stream-error');
  assert.equal(result.failure, 'network');
});

test('ecranul scrie în logul aplicaţiei timpul până la primul text şi durata totală', () => {
  const screen = stripComments(read('src/app/(tabs)/chat.tsx'));
  // OB.1: testerul nu poate cronometra din ochi; aplicaţia notează singură ambele durate.
  assert.match(screen, /logChatLatency\('primul text'/);
  assert.match(screen, /logChatLatency\('total'/);
  // Şi durata până la un refuz de cotă, ca să se vadă dacă „lentoarea" e de fapt o aşteptare impusă.
  assert.match(screen, /logChatLatency\('eșec HTTP'/);
});

test('ecranul foloseşte streamul (nu `functions.invoke`) şi afişează textul pe măsură', () => {
  const screen = stripComments(read('src/app/(tabs)/chat.tsx'));
  // `functions.invoke` citeşte TOT corpul înainte să întoarcă ceva: ar anula streamingul.
  assert.equal(/functions\.invoke/.test(screen), false, 'chat.tsx nu mai are voie să folosească functions.invoke');
  assert.match(screen, /streamChatReply\(/);
  assert.match(screen, /streamingReply/);
  // Fiecare fel de rezultat e tratat: cotă refuzată, stream întrerupt, text incomplet.
  for (const kind of ['http', 'stream-error']) {
    assert.match(screen, new RegExp(`outcome\\.kind === '${kind}'`));
  }
  // `finally` deblochează butonul, indiferent de felul rezultatului.
  assert.match(screen, /finally \{[\s\S]*?setIsSending\(false\)/);
});

// ─── OB.1: măsurătoarea de latență, testată fără logcat ───

test('linia de latență are format stabil și nu conține conținutul conversației', () => {
  // Formatul e contractul cu testerul: se caută cu un singur șir, `[chat-latency]`, în logul aplicației.
  assert.equal(chatLatencyLine('primul text', 1840.4), '[chat-latency] primul text 1840 ms');
  assert.equal(
    chatLatencyLine('total', 7420, 'primul text 1840 ms'),
    '[chat-latency] total 7420 ms (primul text 1840 ms)',
  );
  assert.equal(chatLatencyLine('eșec HTTP', 210, 'status 429'), '[chat-latency] eșec HTTP 210 ms (status 429)');
});

test('logChatLatency scrie linia în logul aplicației', () => {
  const written = [];
  const original = console.log;
  console.log = (line) => written.push(line);
  try {
    logChatLatency('primul text', 1840);
  } finally {
    console.log = original;
  }
  assert.deepEqual(written, ['[chat-latency] primul text 1840 ms']);
});

test('măsurătorile trec prin modulul de latență, nu prin `console.log` în `send`', () => {
  // `tests/chat-send-guards.test.mjs` interzice `console.log` în corpul lui `send` (fără logare de
  // dezvoltare a conținutului AI). De aceea duratele se scriu prin `logChatLatency`, iar aici se
  // fixează ambele capete: apelurile există, iar `console.log` direct nu apare.
  const screen = stripComments(read('src/app/(tabs)/chat.tsx'));
  const sendStart = screen.indexOf('const send = async () => {');
  const sendBody = screen.slice(sendStart, screen.indexOf('return (', sendStart));
  assert.equal(sendBody.includes('console.log'), false, 'niciun console.log direct în send');
  assert.match(sendBody, /logChatLatency\('primul text'/);
  assert.match(sendBody, /logChatLatency\('total'/);
  assert.match(sendBody, /logChatLatency\('eșec HTTP'/);
  assert.match(sendBody, /logChatLatency\('stream întrerupt'/);
});
