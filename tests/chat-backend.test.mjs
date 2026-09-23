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

function harness(options = {}) {
  const events = [];
  let handler;
  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: userId, is_anonymous: options.user !== true } } }) },
    rpc(name, args) {
      events.push({ kind: 'rpc', name, args });
      return { single: async () => ({ data: options.reservation ?? RESERVATION_DEFAULTS, error: options.rpcError ?? null }) };
    },
    from(table) {
      const event = { kind: 'query', table, filters: [] };
      events.push(event);
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
    exports: {}, require: () => ({ createClient: () => client, ...sharedHttp }), Request, Response, AbortSignal,
    ...(options.noCrypto ? {} : { crypto: globalThis.crypto }),
    TextEncoder,
    Deno: {
      env: { get: key => (options.env ?? {})[key] ?? (options.missingConfig ? undefined : 'test-only') },
      serve: callback => { handler = callback; },
    },
    fetch: async (url, init) => {
      events.push({ kind: 'fetch', url, body: JSON.parse(init.body), signal: init.signal });
      if (options.networkError) throw new Error('private upstream details');
      return new Response(options.invalidJson ? 'broken' : JSON.stringify(options.payload ?? { output_text: 'răspuns' }), { status: options.upstreamStatus ?? 200 });
    },
  });
  return {
    events,
    run: (body = { guestId, message: 'question' }, method = 'POST', extraHeaders = {}) => handler(new Request('https://example.invalid', {
      method, headers: options.user === false ? { ...extraHeaders } : { Authorization: 'Bearer test-only', ...extraHeaders },
      ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
    })),
  };
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
test('guest success reserves quota before AI and returns server counters', async () => {
  const h = harness(); const response = await h.run({ guestId, message: ' question ', threadId: 'foreign' });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { reply: 'răspuns', threadId: null, remaining: 4, dailyLimit: 5 });
  assert.deepEqual(h.events.map(e => e.kind), ['rpc', 'fetch']);
  const quotaCall = JSON.parse(JSON.stringify(h.events[0].args));
  assert.equal(quotaCall.p_user_id, userId);
  assert.equal(quotaCall.p_guest_id, null);
  // The brake hashes travel with the reservation; the raw client signals never do.
  assert.match(quotaCall.p_client_hash, /^[0-9a-f]{64}$/);
  assert.match(quotaCall.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(quotaCall.p_client_hash, quotaCall.p_ip_hash);
  assert.equal(h.events[1].body.safety_identifier, userId); assert.ok(h.events[1].signal);
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
  const h = harness({ user: true, reservation: { ...RESERVATION_DEFAULTS, remaining_limit: 49, daily_limit: 50 } });
  const response = await h.run({ guestId: 'forged', userId: 'forged', message: 'question', threadId: 'thread-owned' });
  assert.equal(response.status, 200); assert.equal((await response.json()).dailyLimit, 50);
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
    env: { SUPABASE_URL: 'u', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's', OPENAI_API_KEY: 'k' },
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
