/**
 * Testele endpointului `orthodox-chat` pentru cascadă + negociere (09.10.2026).
 *
 * Rulează cu `npm run test:chat` (runner-ul proiectului, `--filter orthodox-chat`). Folosește exact
 * tehnica suportului de teste existent: compilează sursa TypeScript și o rulează într-un context
 * `vm` cu `Deno`, `fetch` și clientul Supabase false, ca funcția REALĂ să fie testată fără rețea.
 *
 * Ce acoperă, pe lângă suita din `tests/chat-backend.test.mjs`:
 *   · negocierea `Accept`: fără stream → JSON {reply, threadId, remaining, dailyLimit}; cu stream → SSE;
 *   · trecerea la furnizorul următor când contorul zilei e epuizat sau când furnizorul cade (429);
 *   · eroarea finală, neschimbată, când cad toți; câmpurile de siguranță ale pasului OpenAI.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const ENDPOINT = 'supabase/functions/orthodox-chat/index.ts';

function compile(file: string) {
  return ts.transpileModule(readFileSync(resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

function load(file: string, context: Record<string, unknown>) {
  const module = { exports: {} as Record<string, unknown> };
  vm.runInNewContext(compile(file), { exports: module.exports, ...context });
  return module.exports;
}

const aiChain = load('supabase/functions/_shared/ai-chain.ts', {});
const sharedHttp = load('supabase/functions/_shared/http.ts', {
  require: () => ({}),
  Deno: { env: { get: () => undefined } },
  Request, Response, URL, TextEncoder,
});
const limitIdentity = load('supabase/functions/orthodox-chat/limit-identity.ts', {});
assert.equal(typeof aiChain.pickStep, 'function', 'modulul cascadei trebuie să compileze');
assert.equal(typeof sharedHttp.corsHeaders, 'function', 'helperul CORS trebuie să compileze');
assert.equal(typeof limitIdentity.buildLimitIdentity, 'function', 'limit-identity trebuie să compileze');

const compiled = compile(ENDPOINT);
const deviceId = 'aaaaaaaa-bbbb-2222-cccc-3333dddd4444';
const guestId = 'guest-1234567890123456';
const userId = '11111111-1111-4111-8111-111111111111';
const AI_UNAVAILABLE = 'Serviciul AI nu a răspuns. Încearcă din nou mai târziu.';

const RESERVATION = {
  success: true, remaining_limit: 4, daily_limit: 5, denial_reason: null,
  retry_after_seconds: 0, client_limit: 20, monthly_remaining: 19999,
};

function jsonResponse(payload: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function chatOk(text: string, headers: Record<string, string> = {}) {
  return jsonResponse({ choices: [{ message: { role: 'assistant', content: text } }] }, 200, headers);
}

function chatStream(text: string) {
  return new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`,
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

function responsesStream(text: string) {
  return new Response(
    `event: response.output_text.delta\ndata: ${JSON.stringify({ delta: text })}\n\n`
    + 'event: response.completed\ndata: {"type":"response.completed"}\n\n',
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

/** Răspunsul implicit: forma cerută de furnizor, în funcție de URL și de `stream`. */
function respond(req: { url: string; body: Record<string, unknown> }) {
  const wantsStream = req.body.stream === true;
  if (req.url.includes('/responses'))
    return wantsStream ? responsesStream('răspuns') : jsonResponse({ output_text: 'răspuns' });
  return wantsStream ? chatStream('răspuns') : chatOk('răspuns');
}

function harness(options: {
  env?: Record<string, string>;
  respond?: (req: { url: string; body: Record<string, unknown> }) => Response;
  gate?: (step: string) => { allowed: boolean; requests: number };
  /** Simulează baza care nu răspunde la întrebarea „mai poate răspunde pasul acesta azi?”. */
  gateError?: boolean;
  user?: boolean;
} = {}) {
  const events: { seq: number; [key: string]: unknown }[] = [];
  let handler: ((request: Request) => Promise<Response>) | undefined;
  /** Marchează evenimentul ÎN LOC (nu o copie), ca modificările făcute mai târziu pe lanț să rămână vizibile. */
  const mark = (event: Record<string, unknown>) => {
    event.seq = events.length;
    events.push(event);
    return event;
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: userId, is_anonymous: options.user !== true } } }) },
    rpc(name: string, args: Record<string, unknown>) {
      mark({ kind: 'rpc', name, args });
      if (name === 'reserve_ai_provider_step') {
        const allowed = options.gate?.(String(args.p_step)) ?? { allowed: true, requests: 1 };
        return options.gateError
          ? { single: async () => ({ data: null, error: { message: 'rpc unavailable' } }) }
          : { single: async () => ({ data: allowed, error: null }) };
      }
      if (name === 'record_ai_provider_remaining')
        return { single: async () => ({ data: null, error: null }), then: undefined };
      return { single: async () => ({ data: RESERVATION, error: null }) };
    },
    from(table: string) {
      const event: { kind: string; table: string; action?: string; filters: unknown[] } = { kind: 'query', table, filters: [] };
      mark(event);
      const result = () => {
        if (table === 'chat_threads') return { data: { id: 'thread-owned' }, error: null };
        if (event.action === 'insert') return { data: { id: 'message-owned' }, error: null };
        if (event.action === 'delete') return { data: null, error: null };
        return { data: [{ role: 'user', content: 'question' }], error: null };
      };
      const chain: Record<string, unknown> = {
        select: () => chain,
        insert: (value: unknown) => { event.action = 'insert'; event.value = value; return chain; },
        update: () => { event.action = 'update'; return chain; },
        delete: () => { event.action = 'delete'; return chain; },
        eq: () => chain, order: () => chain,
        limit: () => Promise.resolve().then(result),
        single: () => Promise.resolve().then(result),
        maybeSingle: () => Promise.resolve().then(result),
        then: (onOk: unknown, onErr: unknown) => Promise.resolve().then(result).then(onOk as never, onErr as never),
      };
      return chain;
    },
  };
  vm.runInNewContext(compiled, {
    exports: {},
    require: (specifier: string) => (String(specifier).includes('ai-chain')
      ? aiChain
      : String(specifier).includes('limit-identity') ? limitIdentity : { createClient: () => client, ...sharedHttp }),
    Request, Response, AbortSignal, AbortController, ReadableStream, TextDecoder, TextEncoder,
    setTimeout, clearTimeout, crypto: globalThis.crypto,
    console: {
      log: (...parts: unknown[]) => mark({ kind: 'log', line: parts.map(String).join(' ') }),
      warn: (...parts: unknown[]) => mark({ kind: 'warn', line: parts.map(String).join(' ') }),
      error: (...parts: unknown[]) => mark({ kind: 'error', line: parts.map(String).join(' ') }),
    },
    Deno: {
      env: {
        get: (key: string) => (options.env ?? {
          SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', GROQ_API_KEY: 'k',
        })[key],
      },
      serve: (callback: typeof handler) => { handler = callback; },
    },
    fetch: async (url: string, init: { body: string; signal: AbortSignal }) => {
      const body = JSON.parse(init.body);
      mark({ kind: 'fetch', url, body, signal: init.signal });
      const answer = options.respond ? options.respond({ url, body }) : respond({ url, body });
      return answer;
    },
  });
  return {
    events,
    run: (body: Record<string, unknown> = { guestId, message: 'question' }, extraHeaders: Record<string, string> = {}) =>
      handler!(new Request('https://example.invalid', {
        method: 'POST',
        headers: { 'x-device-id': deviceId, Authorization: 'Bearer test-only', ...extraHeaders },
        body: JSON.stringify(body),
      })),
  };
}

async function readSse(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const frames: { event: string | null; data: Record<string, unknown> }[] = [];
  let carry = '';
  let text = '';
  let meta: unknown = null;
  let done = false;
  let error: string | null = null;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    carry += decoder.decode(value, { stream: true });
    for (;;) {
      const boundary = carry.indexOf('\n\n');
      if (boundary === -1) break;
      const raw = carry.slice(0, boundary);
      carry = carry.slice(boundary + 2);
      let name: string | null = null;
      let data = '';
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) name = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      const payload = JSON.parse(data) as Record<string, unknown>;
      frames.push({ event: name, data: payload });
      if (name === 'meta') meta = payload;
      else if (name === 'error') error = String(payload.message ?? '');
      else if (name === 'done') done = true;
      else if (typeof payload.delta === 'string') text += payload.delta;
    }
  }
  return { frames, text, meta, done, error };
}

const fetches = (h: ReturnType<typeof harness>) => h.events.filter(event => event.kind === 'fetch');
const chatLog = (h: ReturnType<typeof harness>) => h.events.find(event => event.kind === 'log' && event.line.startsWith('chat '));
const stepOf = (line: unknown) => JSON.parse(String(line).slice('chat '.length)).step as string;

test('fără Accept vine contractul JSON de dinainte, identic (aplicația instalată)', async () => {
  const h = harness();
  const response = await h.run({ guestId, message: 'Exista Raiul?' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await response.json(), { reply: 'răspuns', threadId: null, dailyLimit: 5, remaining: 4 });
});

test('cu Accept: text/event-stream vin exact cadrele meta · delta · done', async () => {
  const h = harness();
  const response = await h.run({ guestId, message: 'Exista Raiul?' }, { Accept: 'text/event-stream' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
  const { frames, text, meta, done, error } = await readSse(response);
  assert.equal(error, null);
  assert.equal(done, true);
  assert.equal(frames[0].event, 'meta');
  assert.deepEqual(meta, { threadId: null, remaining: 4, dailyLimit: 5 });
  assert.equal(text, 'răspuns');
});

test('pragul din bază: pasul epuizat e sărit fără să fie chemat furnizorul', async () => {
  const h = harness({ gate: (step) => (step === 'groq-120b' ? { allowed: false, requests: 999 } : { allowed: true, requests: 1 }) });
  const response = await h.run({ guestId, message: 'q' }, { Accept: 'text/event-stream' });
  assert.equal(response.status, 200);
  const called = fetches(h);
  assert.equal(called.length, 1, 'pasul epuizat nu consumă o cerere la furnizor');
  assert.ok(String((called[0].body as { model?: string }).model).includes('qwen3.8-27b'), 'răspunde al doilea pas al cascadei');
  assert.equal(stepOf(chatLog(h)!.line), 'groq-qwen');
});

test('un furnizor cade (429): clientul primește răspunsul următorului, fără să afle', async () => {
  const h = harness({
    respond: ({ url, body }) => (String(body.model).includes('gpt-oss-120b')
      ? jsonResponse({ error: { message: 'rate limit exceeded' } }, 429)
      : respond({ url, body })),
  });
  const response = await h.run({ guestId, message: 'q' });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { reply: string }).reply, 'răspuns');
  const called = fetches(h);
  assert.equal(called.length, 2, 'primul furnizor e încercat, apoi se trece mai departe');
  assert.ok(String((called[0].body as { model?: string }).model).includes('gpt-oss-120b'));
  assert.ok(String((called[1].body as { model?: string }).model).includes('qwen3.8-27b'));
  assert.equal(stepOf(chatLog(h)!.line), 'groq-qwen');
});

test('când cad toți furnizorii, răspunsul e exact eroarea de dinainte (502), fără detalii de furnizor', async () => {
  const h = harness({ user: true, respond: () => jsonResponse({ error: { message: 'private upstream details' } }, 429) });
  const response = await h.run({ message: 'q', threadId: 'thread-owned' });
  assert.equal(response.status, 502);
  const body = await response.json() as { error: string };
  assert.equal(body.error, AI_UNAVAILABLE);
  assert.equal(JSON.stringify(body).includes('private'), false);
  assert.ok(h.events.some(event => (event as { table?: string; action?: string }).table === 'chat_messages'
    && (event as { action?: string }).action === 'delete'), 'mesajul optimist se curăță, ca înainte');
  assert.equal(h.events.some(event => (event as { value?: { role?: string } }).value?.role === 'assistant'), false);
});

test('antetul de cotă al furnizorului e scris în tabelă (are prioritate)', async () => {
  const h = harness({
    respond: () => chatOk('răspuns', { 'x-ratelimit-remaining-requests': '998' }),
  });
  await h.run({ guestId, message: 'q' });
  const recorded = h.events.find(event => event.kind === 'rpc' && event.name === 'record_ai_provider_remaining');
  assert.ok(recorded, 'valoarea din antet trebuie salvată');
  assert.equal((recorded.args as { p_remaining: number }).p_remaining, 998);
  assert.equal((recorded.args as { p_step: string }).p_step, 'groq-120b');
});

test('pasul OpenAI se aprinde din configurare, își păstrează câmpurile de siguranță și e primul', async () => {
  const h = harness({
    env: {
      SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's',
      OPENAI_API_KEY: 'k', AI_CHAIN_ENABLE_OPENAI: 'true',
    },
  });
  const response = await h.run({ message: 'q' }, { Accept: 'text/event-stream' });
  assert.equal(response.status, 200);
  const called = fetches(h);
  assert.equal(called.length, 1);
  assert.ok(String(called[0].url).endsWith('/v1/responses'), 'pasul OpenAI folosește Responses API');
  assert.equal(called[0].body.safety_identifier, userId, 'identificatorul de siguranță nu se pierde');
  assert.equal(called[0].body.store, false);
  assert.equal(stepOf(chatLog(h)!.line), 'openai-free');
});

test('cheile lipsă nu opresc cascada: un pas fără secret e sărit, următorul răspunde', async () => {
  const h = harness({
    env: {
      SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's',
      GROQ_API_KEY: '', GEMINI_API_KEY: 'k',
    },
  });
  const response = await h.run({ guestId, message: 'q' }, { Accept: 'text/event-stream' });
  assert.equal(response.status, 200);
  assert.equal(fetches(h).length, 1);
  assert.equal(stepOf(chatLog(h)!.line), 'gemini-flash');
  assert.equal(h.events.some(event => event.kind === 'fetch' && String(event.url).includes('groq.com')), false);
});

test('dacă poarta din bază cade, chatul nu se oprește: răspunde primul furnizor', async () => {
  const h = harness({ gateError: true });
  const response = await h.run({ guestId, message: 'q' }, { Accept: 'text/event-stream' });
  assert.equal(response.status, 200, 'un defect de contorizare nu are voie să dea 502');
  const { text, done, error } = await readSse(response);
  assert.equal(error, null);
  assert.equal(done, true);
  assert.equal(text, 'răspuns');
  assert.equal(stepOf(chatLog(h)!.line), 'groq-120b');
});
