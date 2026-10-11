import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const file = resolve('supabase/functions/orthodox-chat/index.ts');
const source = readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

// The endpoint imports the shared CORS helper from ../_shared/http.ts. The require
// stub below answers every specifier, so the real module must be compiled and handed
// over explicitly — otherwise corsHeaders() resolves to undefined and every response
// path that emits CORS headers throws.
const sharedFile = resolve('supabase/functions/_shared/http.ts');
const sharedCompiled = ts.transpileModule(readFileSync(sharedFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sharedModule = { exports: {} };
vm.runInNewContext(sharedCompiled, {
  exports: sharedModule.exports,
  require: () => ({}),
  Deno: { env: { get: () => undefined } },
  Request,
  Response,
  URL,
  TextEncoder,
});
const sharedHttp = sharedModule.exports;
assert.equal(typeof sharedHttp.corsHeaders, 'function', 'shared corsHeaders must compile');

// Same trap, second module: the endpoint also imports the pure limit-identity helper (C13). It has
// no imports of its own, and the require stub below answers every specifier, so it must be compiled
// and dispatched by specifier — otherwise buildLimitIdentity() is undefined and every request 500s.
const limitIdentityFile = resolve('supabase/functions/orthodox-chat/limit-identity.ts');
const limitIdentityCompiled = ts.transpileModule(readFileSync(limitIdentityFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const limitIdentityModule = { exports: {} };
vm.runInNewContext(limitIdentityCompiled, { exports: limitIdentityModule.exports });
const limitIdentity = limitIdentityModule.exports;
assert.equal(typeof limitIdentity.buildLimitIdentity, 'function', 'limit-identity must compile');

// Same trap, third module: the endpoint now walks the free-provider cascade (`../_shared/ai-chain.ts`).
// It is pure (no imports of its own) and the require stub below answers every specifier, so it must be
// compiled and dispatched by specifier too — otherwise pickStep() is undefined and every request 500s.
const aiChainFile = resolve('supabase/functions/_shared/ai-chain.ts');
const aiChainCompiled = ts.transpileModule(readFileSync(aiChainFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const aiChainModule = { exports: {} };
vm.runInNewContext(aiChainCompiled, { exports: aiChainModule.exports });
const aiChain = aiChainModule.exports;
assert.equal(typeof aiChain.pickStep, 'function', 'ai-chain must compile');

/** The app always sends its per-install identifier; a harness request must not look like a bare bot. */
const deviceId = 'aaaaaaaa-bbbb-2222-cccc-3333dddd4444';

const guestId = 'guest-1234567890123456';
const userId = '11111111-1111-4111-8111-111111111111';

// Check the endpoint through the real Edge typecheck configuration instead of a
// hand-rolled compiler-option set. The previous inline options were a second,
// weaker source of truth for the same files: they did not enable
// `allowImportingTsExtensions`, so the endpoint's `../_shared/http.ts` import
// produced a TS5097 here while `npm run typecheck:edge` was clean.
test('Chat backend typechecks under the real Edge tsconfig', () => {
  const configPath = resolve('tsconfig.edge.json');
  const { config, error: configError } = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.equal(configError, undefined, 'tsconfig.edge.json must be readable');

  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, resolve('.'));
  assert.ok(
    parsed.fileNames.some(name => resolve(name) === file),
    'the Edge tsconfig must include the chat endpoint',
  );

  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
  const errors = ts.getPreEmitDiagnostics(program)
    .filter(diagnostic => diagnostic.file && resolve(diagnostic.file.fileName) === file);

  assert.deepEqual(errors.map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n')), []);
});

/**
 * A reservation row exactly as the database returns it. Cases are stated IN FULL on purpose:
 * a partial row (a column renamed, a field dropped) must fail closed, so this is not merged
 * with defaults — `{ reservation: {} }` has to stay malformed.
 */
const RESERVATION_DEFAULTS = {
  success: true, remaining_limit: 4, daily_limit: 5, denial_reason: null,
  retry_after_seconds: 0, client_limit: 20, monthly_remaining: 19999,
};

/*
 * Cadrele SSE ale modelului, exact cum le trimite OpenAI Responses API când `stream: true`.
 * Endpointul le citeşte, le taie în bucăţi de text şi le trimite mai departe aplicaţiei.
 */
const deltaFrame = (text) => ({ event: 'response.output_text.delta', data: { type: 'response.output_text.delta', delta: text } });
const completedFrame = { event: 'response.completed', data: { type: 'response.completed' } };
const failedFrame = { event: 'response.failed', data: { type: 'response.failed', response: { error: { message: 'private upstream details' } } } };

/**
 * Aceleaşi cadre, în dialectul `chat/completions` vorbit de furnizorii gratuiţi ai cascadei.
 * Testele descriu ce spune modelul; traducerea o face suportul, ca fiecare aşteptare să rămână
 * valabilă indiferent care pas al cascadei răspunde.
 */
function toChatFrame(frame) {
  if (typeof frame.data?.delta === 'string')
    return { event: '', data: { choices: [{ delta: { content: frame.data.delta } }] } };
  // Responses API pune motivul sub `data.response.error`; chat/completions direct sub `data.error`.
  const upstreamError = frame.data?.error ?? frame.data?.response?.error
    ?? (frame.event === 'response.failed' ? { message: 'upstream failed' } : null);
  if (upstreamError)
    return { event: '', data: { error: upstreamError } };
  return { event: '', data: { choices: [{ finish_reason: 'stop' }] } };
}

/** Textul pe care îl „spune" furnizorul fals, oricare ar fi dialectul cerut. */
function upstreamText(options) {
  if (options.frames)
    return options.frames.map(frame => (typeof frame.data?.delta === 'string' ? frame.data.delta : '')).join('');
  if (options.payload === undefined) return 'răspuns';
  return typeof options.payload?.output_text === 'string' ? options.payload.output_text : '';
}

/** Textul brut al unui răspuns SSE: pentru fiecare cadru, `event:` + `data:` + linie goală. */
function sseBody(frames) {
  return frames.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

/** Taie textul în bucăţi de cel mult `size` caractere: aşa se verifică şi cadrele rupte de reţea. */
function chunkText(text, size) {
  const pieces = [];
  for (let index = 0; index < text.length; index += size) pieces.push(text.slice(index, index + size));
  return pieces;
}

/** Cadrele implicite ale unui răspuns reuşit, pornind de la payload-ul cerut de test. */
function defaultFrames(payload) {
  const text = payload === undefined
    ? 'răspuns'
    : (typeof payload?.output_text === 'string' ? payload.output_text : '');
  return text ? [deltaFrame(text), completedFrame] : [completedFrame];
}

function harness(options = {}) {
  const events = [];
  let handler;
  /** Fiecare eveniment primeşte un `seq`, ca testele să poată cere ORDINEA, nu doar prezenţa lui. */
  const mark = (event) => {
    event.seq = events.length;
    events.push(event);
    return event;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: userId, is_anonymous: options.user !== true } } }) },
    rpc(name, args) {
      mark({ kind: 'rpc', name, args });
      // The cascade asks a second question before every provider call: may this step still answer today?
      const data = name === 'reserve_ai_provider_step'
        ? (typeof options.gate === 'function' ? options.gate(String(args.p_step)) : (options.gate ?? { allowed: true, requests: 1 }))
        : (options.reservation ?? RESERVATION_DEFAULTS);
      return { single: async () => ({ data, error: options.rpcError ?? null }) };
    },
    from(table) {
      const event = { kind: 'query', table, filters: [] };
      mark(event);
      const result = () => {
        if (options.dbThrow) throw new Error('private database details');
        if (table === 'chat_threads') return { data: options.foreignThread ? null : { id: 'thread-owned' }, error: null };
        if (event.action === 'insert') return { data: { id: 'message-owned' }, error: null };
        if (event.action === 'delete') return { data: null, error: null };
        return { data: [{ role: 'user', content: 'question' }, { role: 'assistant', content: 'previous' }], error: null };
      };
      const chain = {
        select() { return chain; }, insert(value) { event.action = 'insert'; event.value = value; return chain; },
        update() { event.action = 'update'; return chain; }, delete() { event.action = 'delete'; return chain; },
        eq(key, value) { event.filters.push([key, value]); return chain; }, order() { return chain; },
        limit() { return Promise.resolve().then(result); },
        single() { return Promise.resolve().then(result); }, maybeSingle() { return Promise.resolve().then(result); },
        then(resolve, reject) { return Promise.resolve().then(result).then(resolve, reject); },
      };
      return chain;
    },
  };
  vm.runInNewContext(compiled, {
    exports: {},
    require: specifier => (String(specifier).includes('ai-chain')
      ? aiChain
      : String(specifier).includes('limit-identity')
        ? limitIdentity
        : { createClient: () => client, ...sharedHttp }),
    Request, Response, AbortSignal,
    // Endpointul care livrează bucată cu bucată are nevoie de aceste globale, exact ca în runtime-ul
    // Edge: altfel fiecare cerere cade în `catch`-ul general şi răspunde 500 (fără ele, streamingul nu
    // poate fi nici măcar testat).
    AbortController, ReadableStream, TextDecoder, setTimeout, clearTimeout,
    // Logurile funcţiei sunt măsurătorile cerute de OB.1: se înregistrează, ca testul să le poată citi.
    console: {
      log: (...parts) => mark({ kind: 'log', line: parts.map(String).join(' ') }),
      warn: (...parts) => mark({ kind: 'warn', line: parts.map(String).join(' ') }),
      error: (...parts) => mark({ kind: 'error', line: parts.map(String).join(' ') }),
    },
    ...(options.noCrypto ? {} : { crypto: globalThis.crypto }),
    TextEncoder,
    Deno: {
      // `openaiFirst` aprinde pasul OpenAI exact aşa cum o face producţia: din variabila de configurare,
      // nu din cod. Implicit el e stins (contul n-are credit), deci primul pas e un furnizor gratuit.
      env: {
        get: key => (options.env ?? {})[key]
          ?? (options.openaiFirst && key === 'AI_CHAIN_ENABLE_OPENAI'
            ? 'true'
            : (options.missingConfig ? undefined : 'test-only')),
      },
      serve: callback => { handler = callback; },
    },
    fetch: async (url, init) => {
      const request = JSON.parse(init.body);
      mark({ kind: 'fetch', url, body: request, signal: init.signal });
      if (options.networkError) throw new Error('private upstream details');
      if ((options.upstreamStatus ?? 200) >= 400) return new Response('refuzat', { status: options.upstreamStatus });
      // Dialectul cererii spune cum răspunde furnizorul: pasul OpenAI vorbeşte Responses API (`input`),
      // pasul gratuit vorbeşte chat/completions (`messages`).
      const chatDialect = request.input === undefined;
      if (request.stream !== true) {
        return new Response(JSON.stringify(chatDialect
          ? { choices: [{ message: { role: 'assistant', content: upstreamText(options) } }] }
          : { output_text: upstreamText(options) }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      const frames = options.frames ?? defaultFrames(options.payload);
      const body = options.invalidJson ? 'broken' : sseBody(chatDialect ? frames.map(toChatFrame) : frames);
      const pieces = chunkText(body, options.chunkBytes ?? body.length);
      let index = 0;
      /**
       * Sursa e livrată prin `pull`, nu dintr-o dată: aşa testul poate rupe streamul LA MIJLOC
       * (`streamBreaks`) ori poate arăta că un cadru tăiat de reţea e refăcut corect (`chunkBytes`).
       */
      const upstream = new ReadableStream({
        pull(controller) {
          if (index < pieces.length) {
            controller.enqueue(new TextEncoder().encode(pieces[index]));
            index += 1;
            return;
          }
          mark({ kind: 'upstream-end' });
          if (options.streamBreaks) {
            controller.error(new Error('private upstream details'));
            return;
          }
          controller.close();
        },
      });
      return new Response(upstream, {
        status: options.upstreamStatus ?? 200,
        headers: { 'content-type': options.contentType ?? 'text/event-stream' },
      });
    },
  });
  return {
    events,
    run: (body = { guestId, message: 'question' }, method = 'POST', extraHeaders = {}) => handler(new Request('https://example.invalid', {
      method,
      headers: {
        ...(options.identity === false ? {} : { 'x-device-id': deviceId }),
        ...(options.user === false ? {} : { Authorization: 'Bearer test-only' }),
        // Clientul din repo cere explicit streaming; fără acest antet răspunsul e JSON (aplicaţia v4).
        ...(options.json ? {} : { Accept: 'text/event-stream' }),
        ...extraHeaders,
      },
      ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    })),
  };
}

/**
 * Consumă răspunsul exact cum face aplicaţia: citeşte bucăţile, reface cadrele SSE și adună textul.
 * Citește până la capăt (nu doar primul cadru), fiindcă abia atunci streamul funcţiei s-a încheiat.
 */
async function readSse(response) {
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/, 'răspunsul trebuie livrat ca stream SSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames = [];
  let carry = '';
  let text = '';
  let meta = null;
  let done = false;
  let error = null;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    carry += decoder.decode(value, { stream: true });
    for (;;) {
      const boundary = carry.indexOf('\n\n');
      if (boundary === -1) break;
      const raw = carry.slice(0, boundary);
      carry = carry.slice(boundary + 2);
      let name = null;
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data);
      frames.push({ event: name, data: payload });
      if (name === 'meta') meta = payload;
      else if (name === 'error') error = payload.message ?? '';
      else if (name === 'done') done = true;
      else if (typeof payload.delta === 'string') text += payload.delta;
    }
  }
  return { frames, text, meta, done, error };
}

for (const body of ['{', null, [], 3, '"string"', { guestId, message: '' }, { guestId, message: 'x'.repeat(1201) }]) {
  test(`invalid request returns 400 without consuming quota: ${JSON.stringify(body)?.slice(0, 60)}`, async () => {
    const h = harness(); assert.equal((await h.run(body)).status, 400); assert.equal(h.events.length, 0);
  });
}
test('guest ID validation rejects UUID and missing ID', async () => {
  for (const id of [undefined, userId, guestId]) { const h = harness({ user: false }); assert.equal((await h.run({ guestId: id, message: 'question' })).status, 401); assert.equal(h.events.length, 0); }
});
test('methods and missing configuration fail before database access', async () => {
  const h = harness(); assert.equal((await h.run(null, 'GET')).status, 405); assert.equal((await h.run(null, 'OPTIONS')).status, 200);
  assert.equal((await harness({ missingConfig: true }).run()).status, 503); assert.equal(h.events.length, 0);
});
test('C13: a request with neither address nor device is refused before consuming quota', async () => {
  const h = harness({ identity: false });
  const response = await h.run();
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'client_unidentified');
  assert.deepEqual(h.events, [], 'nothing was reserved and no AI call was made');
});
test('C13: with no address reported, two devices no longer share one brake', async () => {
  const one = harness(); const two = harness();
  await one.run({ guestId, message: 'question' }, 'POST', { 'x-device-id': 'device-aaaaaaaa' });
  await two.run({ guestId, message: 'question' }, 'POST', { 'x-device-id': 'device-bbbbbbbb' });
  const first = one.events[0].args; const second = two.events[0].args;
  assert.notEqual(first.p_ip_hash, second.p_ip_hash, 'a shared bucket would make these equal');
  assert.match(first.p_ip_hash, /^[0-9a-f]{64}$/);
});
test('C13: an implausible device value falls back to the address, never to a shared literal', async () => {
  const h = harness();
  const response = await h.run({ guestId, message: 'question' }, 'POST', { 'x-device-id': 'bad value', 'x-forwarded-for': '203.0.113.9' });
  assert.equal(response.status, 200);
  const call = h.events[0].args;
  assert.match(call.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(call.p_ip_hash, call.p_client_hash);
});
test('guest success reserves quota before AI and returns server counters', async () => {
  const h = harness({ openaiFirst: true }); const response = await h.run({ guestId, message: ' question ', threadId: 'foreign' });
  assert.equal(response.status, 200);
  const { text, meta } = await readSse(response);
  assert.deepEqual(meta, { threadId: null, remaining: 4, dailyLimit: 5 });
  assert.equal(text, 'răspuns');
  // Contoarele vin înaintea textului, iar rezervarea cotei înaintea apelului AI (ordinea din `seq`).
  assert.deepEqual(h.events.filter(e => e.kind !== 'log' && e.kind !== 'upstream-end').map(e => e.kind), ['rpc', 'rpc', 'fetch']);
  // Ambele rezervări se fac ÎNAINTE de apelul AI: cota utilizatorului şi pasul cascadei.
  assert.deepEqual(h.events.filter(e => e.kind === 'rpc').map(e => e.name), ['reserve_ai_request', 'reserve_ai_provider_step']);
  assert.ok(h.events[0].seq < h.events.find(e => e.kind === 'fetch').seq, 'rezervarea se face ÎNAINTE de apelul AI');
  const quotaCall = JSON.parse(JSON.stringify(h.events[0].args));
  assert.equal(quotaCall.p_user_id, userId);
  assert.equal(quotaCall.p_guest_id, null);
  // The brake hashes travel with the reservation; the raw client signals never do.
  assert.match(quotaCall.p_client_hash, /^[0-9a-f]{64}$/);
  assert.match(quotaCall.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(quotaCall.p_client_hash, quotaCall.p_ip_hash);
  const upstreamCall = h.events.find(e => e.kind === 'fetch');
  assert.equal(upstreamCall.body.safety_identifier, userId); assert.ok(upstreamCall.signal);
});
test('daily quota denial returns structured details and never calls AI', async () => {
  const h = harness({ reservation: { ...RESERVATION_DEFAULTS, success: false, remaining_limit: 0, denial_reason: 'daily_limit' } });
  const response = await h.run();
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.equal(body.code, 'daily_limit');
  assert.equal(body.remaining, 0);
  assert.equal(body.dailyLimit, 5);
  assert.equal(body.retryAfter, 0);
  assert.equal(h.events.some(e => e.kind === 'fetch'), false);
});

test('cooldown denial preserves remaining quota and returns retryAfter', async () => {
  const h = harness({ reservation: { ...RESERVATION_DEFAULTS, success: false, remaining_limit: 4, denial_reason: 'cooldown', retry_after_seconds: 3 } });
  const response = await h.run();
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.equal(body.code, 'cooldown');
  assert.equal(body.remaining, 4);
  assert.equal(body.dailyLimit, 5);
  assert.equal(body.retryAfter, 3);
  assert.equal(h.events.some(e => e.kind === 'fetch'), false);
});

test('database or malformed reservation never calls AI', async () => {
  for (const options of [{ rpcError: { message: 'private' } }, { reservation: {} }]) {
    const h = harness(options);
    assert.equal((await h.run()).status, 500);
    assert.equal(h.events.some(e => e.kind === 'fetch'), false);
  }
});
test('authenticated identity comes from verified user, and history is chronological', async () => {
  const h = harness({ user: true, openaiFirst: true, reservation: { ...RESERVATION_DEFAULTS, remaining_limit: 49, daily_limit: 50 } });
  const response = await h.run({ guestId: 'forged', userId: 'forged', message: 'question', threadId: 'thread-owned' });
  assert.equal(response.status, 200); assert.equal((await readSse(response)).meta.dailyLimit, 50);
  assert.equal(h.events.find(e => e.kind === 'rpc').args.p_user_id, userId);
  assert.equal(h.events.find(e => e.kind === 'rpc').args.p_guest_id, null);
  assert.deepEqual(h.events.find(e => e.kind === 'fetch').body.input, [{ role: 'assistant', content: 'previous' }, { role: 'user', content: 'question' }]);
  assert.ok(h.events[0].filters.some(([key, value]) => key === 'user_id' && value === userId));
});
test('foreign thread is rejected before quota or AI', async () => {
  const h = harness({ user: true, foreignThread: true }); assert.equal((await h.run({ message: 'question', threadId: 'foreign' })).status, 404);
  assert.equal(h.events.some(e => e.kind === 'rpc' || e.kind === 'fetch'), false);
});
for (const options of [{ networkError: true }, { invalidJson: true }, { payload: null, upstreamStatus: 500 }, { payload: {} }]) {
  test(`upstream failure cleans optimistic message: ${JSON.stringify(options)}`, async () => {
    const h = harness({ ...options, user: true }); const response = await h.run({ message: 'question', threadId: 'thread-owned' });
    assert.equal(response.status, 502); assert.equal(JSON.stringify(await response.json()).includes('private'), false);
    assert.ok(h.events.some(e => e.table === 'chat_messages' && e.action === 'delete'));
    assert.equal(h.events.some(e => e.value?.role === 'assistant'), false);
  });
}
test('unexpected database exception is sanitized', async () => {
  const h = harness({ user: true, dbThrow: true }); const response = await h.run({ message: 'question', threadId: 'thread-owned' });
  assert.equal(response.status, 500); assert.equal(JSON.stringify(await response.json()).includes('private'), false);
});

test('rejected authenticated reservation cannot create an empty thread', async () => {
  const h = harness({ user: true, reservation: { ...RESERVATION_DEFAULTS, success: false, remaining_limit: 0, denial_reason: 'daily_limit' } });
  assert.equal((await h.run({ message: 'question' })).status, 429);
  assert.deepEqual(h.events.map(e => e.kind), ['rpc']);
});

test('malformed quota results fail closed', async () => {
  for (const reservation of [
    { success: true, remaining_limit: -1, daily_limit: 5 },
    { success: true, remaining_limit: 999, daily_limit: 5 },
    { success: true, remaining_limit: 4, daily_limit: 500 },
    { success: 'yes', remaining_limit: 4, daily_limit: 5 },
  ]) {
    const h = harness({ reservation }); assert.equal((await h.run()).status, 500);
    assert.equal(h.events.some(e => e.kind === 'fetch'), false);
  }
});

// ─── per-device/IP brake and the global monthly cap (20260923000100) ───────────

const headersFor = (ip, device) => ({ 'x-forwarded-for': ip, 'x-device-id': device });
const quotaArgs = (h) => JSON.parse(JSON.stringify(h.events.find(e => e.kind === 'rpc').args));

test('the same client produces the same two hashes; a different device or IP does not', async () => {
  const first = harness({ user: true }); await first.run({ message: 'q' }, 'POST', headersFor('203.0.113.7', 'device-aaaa1111'));
  const second = harness({ user: true }); await second.run({ message: 'q' }, 'POST', headersFor('203.0.113.7', 'device-aaaa1111'));
  const otherDevice = harness({ user: true }); await otherDevice.run({ message: 'q' }, 'POST', headersFor('203.0.113.7', 'device-bbbb2222'));
  const otherIp = harness({ user: true }); await otherIp.run({ message: 'q' }, 'POST', headersFor('198.51.100.9', 'device-aaaa1111'));

  assert.equal(quotaArgs(first).p_client_hash, quotaArgs(second).p_client_hash);
  assert.equal(quotaArgs(first).p_ip_hash, quotaArgs(second).p_ip_hash);
  // Rotating the device identifier keeps the IP hash, which is exactly why both counters exist.
  assert.notEqual(quotaArgs(first).p_client_hash, quotaArgs(otherDevice).p_client_hash);
  assert.equal(quotaArgs(first).p_ip_hash, quotaArgs(otherDevice).p_ip_hash);
  assert.notEqual(quotaArgs(first).p_ip_hash, quotaArgs(otherIp).p_ip_hash);
  assert.notEqual(quotaArgs(first).p_client_hash, quotaArgs(otherIp).p_client_hash);
});

test('the raw IP and device values never reach the database or the logs of this call', async () => {
  const h = harness({ user: true });
  await h.run({ message: 'q' }, 'POST', headersFor('203.0.113.7', 'device-aaaa1111'));
  const serialized = JSON.stringify(h.events);
  assert.equal(serialized.includes('203.0.113.7'), false);
  assert.equal(serialized.includes('device-aaaa1111'), false);
});

test('a missing Web Crypto or a missing salt refuses before any database access', async () => {
  const noCrypto = harness({ user: true, noCrypto: true });
  assert.equal((await noCrypto.run({ message: 'q' })).status, 503);
  assert.equal(noCrypto.events.length, 0);
  // An unset dedicated salt falls back to the service-role key, which is already server-only.
  const fallback = harness({
    user: true,
    env: {
      SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's',
      OPENAI_API_KEY: 'k', AI_CHAIN_ENABLE_OPENAI: 'true',
    },
  });
  assert.equal((await fallback.run({ message: 'q' })).status, 200);
});

for (const [reason, code, extra] of [
  ['client_limit', 'client_limit', {}],
  ['ip_limit', 'ip_limit', {}],
]) {
  test(`${reason} denial returns 429 with the machine-readable code`, async () => {
    const h = harness({ user: true, reservation: { ...RESERVATION_DEFAULTS, success: false, remaining_limit: 0, denial_reason: reason } });
    const response = await h.run({ message: 'q' });
    assert.equal(response.status, 429);
    const body = await response.json();
    assert.equal(body.code, code);
    assert.equal(body.remaining, 0);
    assert.equal(body.dailyLimit, 5);
    assert.equal(h.events.some(e => e.kind === 'fetch'), false);
    assert.equal(JSON.stringify(body).includes(reason === 'client_limit' ? 'dispozitiv' : 're\u021bea'), true);
    void extra;
  });
}

test('the monthly cap is refused for everyone and says when the budget resets', async () => {
  const h = harness({ user: true, reservation: { ...RESERVATION_DEFAULTS, success: false, remaining_limit: 0, denial_reason: 'monthly_cap', retry_after_seconds: 412_345, monthly_remaining: 0 } });
  const response = await h.run({ message: 'q' });
  assert.equal(response.status, 429);
  const body = await response.json();
  assert.equal(body.code, 'monthly_cap');
  assert.equal(body.monthlyRemaining, 0);
  assert.equal(body.retryAfter, 412_345);
  assert.equal(h.events.some(e => e.kind === 'fetch'), false);
});

test('an inconsistent reservation is refused instead of trusted', async () => {
  const cases = [
    { denial_reason: 'unknown_reason', success: false, remaining_limit: 0, retry_after_seconds: 0 },
    { denial_reason: 'monthly_cap', success: false, remaining_limit: 0, retry_after_seconds: 0, monthly_remaining: 0 },
    { denial_reason: 'monthly_cap', success: false, remaining_limit: 0, retry_after_seconds: 99_999_999, monthly_remaining: 0 },
    { denial_reason: 'monthly_cap', success: false, remaining_limit: 0, retry_after_seconds: 60, monthly_remaining: 5 },
    { denial_reason: 'client_limit', success: false, remaining_limit: 0, retry_after_seconds: 3 },
    { denial_reason: 'client_limit', success: false, remaining_limit: 2, retry_after_seconds: 0 },
    { denial_reason: 'cooldown', success: false, remaining_limit: 4, retry_after_seconds: 9 },
    { success: true, remaining_limit: 4, monthly_remaining: -1 },
    { success: true, remaining_limit: 4, client_limit: 21 },
  ];
  for (const reservation of cases) {
    const h = harness({ user: true, reservation });
    assert.equal((await h.run({ message: 'q' })).status, 500, JSON.stringify(reservation));
    assert.equal(h.events.some(e => e.kind === 'fetch'), false);
  }
});

// ─── streaming: model → funcție → aplicație, bucată cu bucată (OB.2) ─────────────────────────

test('streaming: bucățile ajung pe rând și în ordine, cu contoarele înaintea textului', async () => {
  const chunks = ['Bună, ', 'acesta ', 'este răspunsul.'];
  // Bucăți de 3 octeți la intrare: cadrele sosesc TĂIATE, exact ca pe o rețea reală.
  const h = harness({ user: true, frames: [...chunks.map(deltaFrame), completedFrame], chunkBytes: 3 });
  const response = await h.run({ message: 'question', threadId: 'thread-owned' });
  assert.equal(response.status, 200);
  const { frames, text, meta, done, error } = await readSse(response);
  assert.equal(error, null, 'un răspuns reușit nu trimite eveniment de eroare');
  assert.equal(done, true, 'streamul se încheie cu `event: done`');
  assert.equal(frames[0].event, 'meta', 'contoarele pleacă ÎNAINTE de primul text');
  assert.deepEqual(meta, { threadId: 'thread-owned', remaining: 4, dailyLimit: 5 });
  assert.deepEqual(frames.filter(frame => frame.event === null).map(frame => frame.data.delta), chunks);
  assert.equal(text, chunks.join(''), 'textul e refăcut exact, deși cadrele au fost tăiate de rețea');
  // OB.1: măsurătorile cerute sunt scrise în logurile funcției, ca valori reale (nu estimate).
  const ttft = h.events.find(event => event.kind === 'log' && event.line.startsWith('chat-stream ttft'));
  const total = h.events.find(event => event.kind === 'log' && event.line.startsWith('chat-stream total'));
  assert.ok(ttft, 'timpul până la primul text se loghează');
  assert.ok(total, 'durată totală se loghează');
  assert.match(ttft.line, /"ttftMs":\d+/);
  assert.match(total.line, /"totalMs":\d+/);
  assert.match(total.line, new RegExp(`"chars":${chunks.join('').length}`));
  // Rezervarea cotei înaintea apelului AI; istoricul scris DUPĂ ce streamul modelului s-a terminat.
  const upstream = h.events.find(event => event.kind === 'fetch');
  const saved = h.events.find(event => event.value?.role === 'assistant');
  assert.equal(upstream.body.stream, true, 'funcția cere modelului streaming');
  assert.ok(h.events.find(event => event.kind === 'rpc').seq < upstream.seq, 'cota se rezervă ÎNAINTE de apelul AI');
  assert.ok(saved.seq > h.events.find(event => event.kind === 'upstream-end').seq, 'scrierea nu se face în timpul streamului');
  assert.equal(saved.value.content, chunks.join(''));
});

test('streaming: eroarea modelului la mijlocul răspunsului dă mesaj clar, nu balon gol', async () => {
  const h = harness({ user: true, frames: [deltaFrame('Bună'), failedFrame] });
  const response = await h.run({ message: 'question', threadId: 'thread-owned' });
  assert.equal(response.status, 200, 'streamul a început deja: eroarea se livrează în stream, nu ca HTTP');
  const { text, error, done } = await readSse(response);
  assert.equal(text, 'Bună', 'textul deja sosit rămâne pe ecran');
  assert.equal(done, false);
  assert.equal(typeof error, 'string');
  assert.ok(error.length > 0, 'aplicația are ce afișa, în locul unui spinner veșnic');
  assert.equal(error.includes('private'), false, 'motivul furnizorului nu ajunge la utilizator');
  assert.equal(h.events.some(event => event.value?.role === 'assistant'), false, 'răspunsul parțial NU se salvează');
  assert.ok(h.events.some(event => event.table === 'chat_messages' && event.action === 'delete'), 'mesajul optimist se curăță');
});

test('streaming: o cădere de rețea la mijlocul streamului dă tot mesaj clar', async () => {
  const h = harness({ user: true, frames: [deltaFrame('Bună'), deltaFrame(' iar')], streamBreaks: true });
  const response = await h.run({ message: 'question', threadId: 'thread-owned' });
  assert.equal(response.status, 200);
  const { text, error, done } = await readSse(response);
  assert.equal(text, 'Bună iar');
  assert.equal(done, false);
  assert.ok(typeof error === 'string' && error.length > 0);
  assert.equal(h.events.some(event => event.value?.role === 'assistant'), false);
});

test('streaming: anularea din aplicație oprește modelul și nu salvează un răspuns parțial', async () => {
  const h = harness({ user: true, frames: [deltaFrame('prima '), deltaFrame('a doua')], chunkBytes: 8 });
  const response = await h.run({ message: 'question', threadId: 'thread-owned' });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  await reader.read();
  await reader.cancel();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(h.events.some(event => event.value?.role === 'assistant'), false, 'răspunsul parțial nu se scrie în istoric');
  assert.equal(h.events.find(event => event.kind === 'fetch').signal.aborted, true, 'apelul către model se oprește');
});

// ─── cascada de furnizori gratuiți (09.10.2026) ──────────────────────────────────────────────

test('cascada implicită: fără OpenAI, răspunde primul furnizor gratuit, cu același contract SSE', async () => {
  const h = harness();
  const response = await h.run({ guestId, message: 'question' });
  assert.equal(response.status, 200);
  const { text, meta, done, error } = await readSse(response);
  assert.equal(error, null);
  assert.equal(done, true);
  assert.equal(text, 'răspuns');
  assert.deepEqual(meta, { threadId: null, remaining: 4, dailyLimit: 5 });

  const calls = h.events.filter(event => event.kind === 'fetch');
  assert.equal(calls.length, 1, 'un singur furnizor consumă o cerere');
  assert.match(String(calls[0].body.model), /gpt-oss-120b/, 'primul pas al cascadei');
  assert.equal(calls[0].body.stream, true, 'se cere streaming de la furnizor');
  assert.equal(calls[0].body.store, undefined, 'câmpurile Responses API nu se trimit unui furnizor chat');

  // Poarta din bază e întrebată cu pasul şi pragul lui, înainte de apelul la furnizor.
  const gate = h.events.find(event => event.kind === 'rpc' && event.name === 'reserve_ai_provider_step');
  assert.deepEqual([gate.args.p_step, gate.args.p_switch_at], ['groq-120b', 999]);
  assert.ok(gate.seq < calls[0].seq, 'pragul se verifică înainte de a chema furnizorul');
  assert.equal(h.events.find(event => event.kind === 'log' && event.line.startsWith('chat ')).line.includes('groq'), true);
  assert.equal(JSON.stringify(h.events).includes('test-only'), false, 'cheia folosită nu apare în loguri');
});

test('fără `Accept`, contractul e JSON (aplicația instalată), cu aceeași cascadă', async () => {
  const h = harness({ json: true });
  const response = await h.run({ guestId, message: 'question' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await response.json(), { reply: 'răspuns', threadId: null, dailyLimit: 5, remaining: 4 });
  const calls = h.events.filter(event => event.kind === 'fetch');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.stream, false, 'pe calea JSON nu se cere streaming');
});

test('un pas sărit de prag nu cheamă furnizorul: răspunde următorul din cascadă', async () => {
  const h = harness({ gate: step => (step === 'groq-120b' ? { allowed: false, requests: 999 } : { allowed: true, requests: 1 }) });
  const response = await h.run({ guestId, message: 'question' });
  assert.equal(response.status, 200);
  const calls = h.events.filter(event => event.kind === 'fetch');
  assert.equal(calls.length, 1);
  assert.match(String(calls[0].body.model), /qwen3\.8-27b/, 'al doilea pas al cascadei');
  assert.equal((await readSse(response)).text, 'răspuns');
});
