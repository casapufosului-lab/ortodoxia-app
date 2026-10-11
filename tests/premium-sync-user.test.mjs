/**
 * T3 (10.10.2026) — suita functiei `revenuecat-sync-user` + a conditiei de apel din aplicatie.
 *
 * Ce dovedeste, binar:
 *   A. CONDITIA DE APEL (aplicatia)  — se cere reconcilierea DOAR cand entitlement-ul e activ si
 *      randul din baza nu confirma, si NU se cere nimic cand entitlement-ul e inactiv.
 *   B. THROTTLE                      — a doua cerere in aceeasi fereastra de 10 minute NU se face.
 *   C. IDENTITATEA                   — se foloseste JWT-ul, niciodata un `user_id` trimis de client.
 *   D. SERVERUL                      — 401 / 204 / 502 / 500 / 409 pe cazurile reale, fara bucla si
 *      fara date personale in raspuns.
 *
 * Se importa direct sursele TypeScript (fara build), exact ca suita webhook: `core.ts` al functiei noi
 * nu are importuri de runtime in afara de helperii din webhook, iar `premium-sync-policy.ts` este pur.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  environmentFor,
  handleSyncUser,
} from '../supabase/functions/revenuecat-sync-user/core.ts';
import {
  PREMIUM_SYNC_FUNCTION,
  PREMIUM_SYNC_THROTTLE_MS,
  throttleAllowsRequest,
} from '../src/lib/premium-sync-policy.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const MONTHLY = 'ro.ortodoxia.premium.monthly';
const SNAPSHOT_MS = Date.parse('2026-10-10T12:00:00.000Z');
const EXPIRES = '2026-11-10T12:00:00.000Z';

function customerInfo({
  entitlement = true,
  isSandbox = true,
  store = 'app_store',
  expiresDate = EXPIRES,
} = {}) {
  return {
    request_date_ms: SNAPSHOT_MS,
    subscriber: {
      entitlements: entitlement
        ? { premium: { expires_date: expiresDate, product_identifier: MONTHLY } }
        : {},
      subscriptions: {
        [MONTHLY]: {
          expires_date: expiresDate,
          store,
          is_sandbox: isSandbox,
          store_transaction_id: 'txn-1',
        },
      },
    },
  };
}

function recorder({
  user = { id: USER_ID },
  rcStatus = 200,
  rcBody = customerInfo(),
  rcThrows = false,
  rpcResult = { data: true, error: null },
} = {}) {
  const calls = { getUser: [], fetch: [], rpc: [] };
  const deps = {
    revenueCatApiKey: 'test-key-not-a-secret',
    getUser: async (token) => {
      calls.getUser.push(token);
      return user;
    },
    fetcher: async (url, init) => {
      calls.fetch.push({ url: String(url), authorization: init?.headers?.Authorization });
      if (rcThrows) throw new Error('network down');
      return new Response(JSON.stringify(rcBody), {
        status: rcStatus,
        headers: { 'content-type': 'application/json' },
      });
    },
    admin: {
      rpc: async (fn, args) => {
        calls.rpc.push({ fn, args });
        return rpcResult;
      },
    },
  };
  return { deps, calls };
}

function request({ method = 'POST', token = 'session-jwt', body = null } = {}) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request('https://project.supabase.co/functions/v1/revenuecat-sync-user', {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });
}

function source(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

// ─────────────────────────────────────────────────────────────────────────────
// A. CONDITIA DE APEL (aplicatia)
// ─────────────────────────────────────────────────────────────────────────────

test('T3/A conditia de apel: entitlement activ + rand care nu confirma => o singura chemare, apoi re-citire', () => {
  const hook = source('src/hooks/use-subscription.ts');

  // Exact o chemare in tot fisierul, si doar in interiorul efectului de reconciliere.
  assert.equal((hook.match(/requestPremiumSync\(\)/g) || []).length, 1);
  assert.match(hook, /await requestPremiumSync\(\);[\s\S]{0,120}await refresh\(\);/);
  assert.ok(hook.includes("from '@/lib/premium-sync'"));

  // Conditia este derivata din aceeasi regula ca accesul: `needsServerSync(revenueCat.premiumActive, subscription)`.
  assert.ok(hook.includes('needsServerSync(revenueCat.premiumActive, subscription)'));
  assert.ok(hook.includes('if (!user) return undefined;'));
  // Fara bucle: fereastra de racire este verificata inainte de chemare.
  assert.ok(hook.includes('throttleAllowsRequest(lastSyncRequestAtRef.current, Date.now())'));

  // `needsServerSync` foloseste `hasPremiumAccess`, adica regula dupa care se taie accesul, nu o copie.
  const sync = source('src/lib/premium-sync.ts');
  assert.match(sync, /export function needsServerSync\([\s\S]{0,220}if \(!premiumActive\) return false;\s*return !hasPremiumAccess\(row\);/);
  assert.ok(sync.includes('hasPremiumAccess'));
});

test('T3/A conditia de apel: chemarea este POST fara corp (fara id trimis de client)', () => {
  const sync = source('src/lib/premium-sync.ts');
  assert.match(sync, /supabase\.functions\.invoke\(PREMIUM_SYNC_FUNCTION, \{ method: 'POST' \}\)/);
  // Niciun `body:` in tot modulul: identitatea este tokenul de sesiune pus de `invoke` in `Authorization`.
  assert.equal(sync.includes('body:'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// B. THROTTLE (executat, nu citit ca text)
// ─────────────────────────────────────────────────────────────────────────────

test('T3/B throttle: a doua chemare in 10 minute NU se face, a treia dupa 10 minute da', () => {
  assert.equal(PREMIUM_SYNC_THROTTLE_MS, 10 * 60 * 1000);
  assert.equal(PREMIUM_SYNC_FUNCTION, 'revenuecat-sync-user');

  const t0 = Date.parse('2026-10-10T12:00:00.000Z');
  // Niciodata chemata -> prima cerere este permisa.
  assert.equal(throttleAllowsRequest(0, t0), true);
  // A doua cerere in aceeasi fereastra (1 minut, 9 min 59,999 s) -> refuzata.
  assert.equal(throttleAllowsRequest(t0, t0 + 60_000), false);
  assert.equal(throttleAllowsRequest(t0, t0 + 599_999), false);
  // Exact la 10 minute -> permisa.
  assert.equal(throttleAllowsRequest(t0, t0 + 600_000), true);
  // Ceas in urma (ora de vara / NTP) -> refuzata, nu se ia decizia pe un timp absurd.
  assert.equal(throttleAllowsRequest(t0, t0 - 5_000), false);
  // Valori imposibile nu blocheaza prima cerere.
  assert.equal(throttleAllowsRequest(Number.NaN, t0), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// C. IDENTITATEA — JWT, nu id-ul din corp
// ─────────────────────────────────────────────────────────────────────────────

test('T3/C identitatea: se foloseste JWT-ul, nu `user_id` din corpul cererii', async () => {
  const { deps, calls } = recorder();
  const result = await handleSyncUser(request({ body: { user_id: OTHER_ID } }), deps);

  assert.equal(result.status, 204);
  // Tokenul primit a fost trimis exact asa la GoTrue.
  assert.deepEqual(calls.getUser, ['session-jwt']);
  // RevenueCat a fost intrebat despre utilizatorul din JWT, nu despre cel din corp.
  assert.equal(calls.fetch.length, 1);
  assert.ok(calls.fetch[0].url.endsWith(`/subscribers/${USER_ID}`));
  assert.equal(calls.fetch[0].url.includes(OTHER_ID), false);
  // Randul scris este al utilizatorului din JWT.
  assert.equal(calls.rpc[0].args.p_user_id, USER_ID);
});

test('T3/C identitatea: fara token => 401 si nicio chemare (nici RevenueCat, nici scriere)', async () => {
  const { deps, calls } = recorder();
  const result = await handleSyncUser(request({ token: '' }), deps);

  assert.equal(result.status, 401);
  assert.deepEqual(calls.getUser, []);
  assert.deepEqual(calls.fetch, []);
  assert.deepEqual(calls.rpc, []);
});

test('T3/C identitatea: token invalid (GoTrue nu il recunoaste) => 401, fara chemare RevenueCat', async () => {
  const { deps, calls } = recorder({ user: null });
  const result = await handleSyncUser(request(), deps);

  assert.equal(result.status, 401);
  assert.deepEqual(calls.getUser, ['session-jwt']);
  assert.deepEqual(calls.fetch, []);
  assert.deepEqual(calls.rpc, []);
});

test('T3/C identitatea: serverul nu citeste corpul cererii si nu construieste id-uri din client', () => {
  const core = source('supabase/functions/revenuecat-sync-user/core.ts');
  assert.equal(core.includes('req.json'), false);
  assert.equal(core.includes('req.text'), false);
  assert.equal(core.includes('req.formData'), false);
  // Identitatea se ia dintr-un singur loc: header-ul `Authorization`.
  assert.equal((core.match(/req\.headers\.get\('Authorization'\)/g) || []).length, 1);
  // Cheia RevenueCat nu ajunge in raspuns: nu apare in niciun corp returnat.
  assert.equal(/body: \{[^}]*revenueCatApiKey/.test(core), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// D. SERVERUL — coduri si efecte
// ─────────────────────────────────────────────────────────────────────────────

test('T3/D 204: entitlement activ => randul este scris prin RPC, cu mediul derivat din payload', async () => {
  const { deps, calls } = recorder();
  const result = await handleSyncUser(request(), deps);

  assert.equal(result.status, 204);
  assert.equal(result.body, null);
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0].fn, 'sync_revenuecat_subscription');

  const args = calls.rpc[0].args;
  assert.equal(args.p_user_id, USER_ID);
  assert.equal(args.p_status, 'active');
  assert.equal(args.p_plan, 'monthly');
  assert.equal(args.p_product_id, MONTHLY);
  assert.equal(args.p_provider, 'apple');
  assert.equal(args.p_environment, 'sandbox');
  assert.equal(args.p_provider_subscription_id, 'txn-1');
  assert.equal(args.p_current_period_end, EXPIRES);
  assert.equal(args.p_snapshot_at_ms, SNAPSHOT_MS);
});

test('T3/D 204: is_sandbox=false => environment production (provenienta corecta)', async () => {
  const { deps, calls } = recorder({ rcBody: customerInfo({ isSandbox: false }) });
  const result = await handleSyncUser(request(), deps);

  assert.equal(result.status, 204);
  assert.equal(calls.rpc[0].args.p_environment, 'production');
});

test('T3/D environmentFor: nedeterminat => null (nu se inventeaza provenienta)', () => {
  assert.equal(environmentFor({ is_sandbox: true }), 'sandbox');
  assert.equal(environmentFor({ is_sandbox: false }), 'production');
  assert.equal(environmentFor({}), null);
  assert.equal(environmentFor(undefined), null);
  assert.equal(environmentFor({ is_sandbox: null }), null);
});

test('T3/D 502: apelul RevenueCat raspunde cu eroare => 502 si nicio scriere', async () => {
  const { deps, calls } = recorder({ rcStatus: 401, rcBody: { message: 'Invalid API Key' } });
  const result = await handleSyncUser(request(), deps);

  assert.equal(result.status, 502);
  assert.deepEqual(calls.rpc, []);
});

test('T3/D 502: apelul RevenueCat arunca (retea) => 502 si nicio scriere', async () => {
  const { deps, calls } = recorder({ rcThrows: true });
  const result = await handleSyncUser(request(), deps);

  assert.equal(result.status, 502);
  assert.deepEqual(calls.rpc, []);
});

test('T3/D 502: raspuns fara `subscriber` sau fara `request_date_ms` => 502, fara scriere', async () => {
  const withoutSubscriber = recorder({ rcBody: { request_date_ms: SNAPSHOT_MS } });
  assert.equal((await handleSyncUser(request(), withoutSubscriber.deps)).status, 502);
  assert.deepEqual(withoutSubscriber.calls.rpc, []);

  const body = customerInfo();
  delete body.request_date_ms;
  const withoutTimestamp = recorder({ rcBody: body });
  assert.equal((await handleSyncUser(request(), withoutTimestamp.deps)).status, 502);
  assert.deepEqual(withoutTimestamp.calls.rpc, []);
});

test('T3/D 500: scrierea esueaza => 500 (nu 204, nu 502)', async () => {
  const { deps, calls } = recorder({ rpcResult: { data: null, error: { message: 'permission denied' } } });
  const result = await handleSyncUser(request(), deps);

  assert.equal(result.status, 500);
  assert.equal(calls.fetch.length, 1);
  assert.equal(calls.rpc.length, 1);
});

test('T3/D 409: fara entitlement `premium` => nimic de scris, cod explicit', async () => {
  const { deps, calls } = recorder({ rcBody: customerInfo({ entitlement: false }) });
  const result = await handleSyncUser(request(), deps);

  assert.equal(result.status, 409);
  assert.equal(result.body.reason, 'no_premium_subscription');
  assert.deepEqual(calls.rpc, []);
});

test('T3/D 409: entitlement expirat server-side => nu se coboara randul, cod explicit', async () => {
  const { deps, calls } = recorder({
    rcBody: customerInfo({ expiresDate: '2026-10-01T12:00:00.000Z' }),
  });
  const result = await handleSyncUser(request(), deps);

  assert.equal(result.status, 409);
  assert.equal(result.body.reason, 'not_active_server_side');
  assert.deepEqual(calls.rpc, []);
});

test('T3/D 409: RPC-ul refuza un instantaneu mai vechi => 409 stale_snapshot', async () => {
  const { deps } = recorder({ rpcResult: { data: false, error: null } });
  const result = await handleSyncUser(request(), deps);

  assert.equal(result.status, 409);
  assert.equal(result.body.reason, 'stale_snapshot');
});

test('T3/D 405 si 503: metoda gresita / configurare lipsa', async () => {
  const { deps, calls } = recorder();
  assert.equal((await handleSyncUser(request({ method: 'GET' }), deps)).status, 405);
  assert.deepEqual(calls.getUser, []);

  const noKey = recorder();
  noKey.deps.revenueCatApiKey = null;
  assert.equal((await handleSyncUser(request(), noKey.deps)).status, 503);
});

test('T3/D fara date personale in raspuns: niciun id, niciun email, nicio cheie', async () => {
  const { deps } = recorder();
  const ok = await handleSyncUser(request(), deps);
  assert.equal(ok.body, null);

  const cases = [
    await handleSyncUser(request({ token: '' }), recorder().deps),
    await handleSyncUser(request(), recorder({ user: null }).deps),
    await handleSyncUser(request(), recorder({ rcBody: customerInfo({ entitlement: false }) }).deps),
    await handleSyncUser(request(), recorder({ rcStatus: 500, rcBody: {} }).deps),
    await handleSyncUser(request(), recorder({ rpcResult: { data: null, error: { message: 'x' } } }).deps),
  ];
  for (const result of cases) {
    const text = JSON.stringify(result.body);
    assert.equal(text.includes(USER_ID), false);
    assert.equal(text.includes('@'), false);
    assert.equal(text.includes('test-key-not-a-secret'), false);
  }
});

test('T3/D functia este livrata cu verify_jwt = true (nu --no-verify-jwt)', () => {
  const config = source('supabase/config.toml');
  assert.match(config, /\[functions\.revenuecat-sync-user\]\r?\nverify_jwt = true/);
  // Proba negativa: blocul nu are `verify_jwt = false`.
  const block = config.slice(config.indexOf('[functions.revenuecat-sync-user]'));
  const body = block.slice(0, block.indexOf('[', 1) === -1 ? block.length : block.indexOf('[', 1));
  assert.equal(body.includes('verify_jwt = false'), false);
});
