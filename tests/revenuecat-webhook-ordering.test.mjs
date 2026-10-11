import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  handleWebhook,
  providerForStore,
  resolveCustomerSnapshot,
} from '../supabase/functions/revenuecat-webhook/core.ts';

const MONTHLY = 'ro.ortodoxia.premium.monthly';
const ANNUAL = 'ro.ortodoxia.premium.annual';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SNAPSHOT_MS = Date.parse('2026-09-09T16:00:00.000Z');

function customerInfo({
  productId = MONTHLY,
  expiresDate = '2026-10-09T16:00:00.000Z',
  graceDate = null,
  unsubscribeDetectedAt = null,
  refundedAt = null,
  periodType = 'normal',
  entitlement = true,
  snapshotMs = SNAPSHOT_MS,
} = {}) {
  return {
    request_date_ms: snapshotMs,
    subscriber: {
      entitlements: entitlement
        ? {
            premium: {
              expires_date: expiresDate,
              grace_period_expires_date: graceDate,
              product_identifier: productId,
            },
          }
        : {},
      subscriptions: {
        [productId]: {
          expires_date: expiresDate,
          grace_period_expires_date: graceDate,
          unsubscribe_detected_at: unsubscribeDetectedAt,
          refunded_at: refundedAt,
          period_type: periodType,
          store_transaction_id: 'store-txn-1',
        },
      },
    },
  };
}

test('HIGH #7 active Customer Info resolves from authoritative snapshot', () => {
  const snapshot = resolveCustomerSnapshot(customerInfo(), MONTHLY);

  assert.ok(snapshot);
  assert.equal(snapshot.status, 'active');
  assert.equal(snapshot.plan, 'monthly');
  assert.equal(snapshot.product_id, MONTHLY);
  assert.equal(snapshot.cancel_at_period_end, false);
  assert.equal(snapshot.snapshot_at_ms, SNAPSHOT_MS);
  assert.equal(snapshot.provider_subscription_id, 'store-txn-1');
});

test('HIGH #7 trial resolves to trialing', () => {
  const snapshot = resolveCustomerSnapshot(
    customerInfo({ productId: ANNUAL, periodType: 'trial' }),
    ANNUAL,
  );

  assert.ok(snapshot);
  assert.equal(snapshot.status, 'trialing');
  assert.equal(snapshot.plan, 'annual');
});

test('HIGH #7 unsubscribe with access remaining resolves to canceled', () => {
  const snapshot = resolveCustomerSnapshot(
    customerInfo({ unsubscribeDetectedAt: '2026-09-08T12:00:00.000Z' }),
    MONTHLY,
  );

  assert.ok(snapshot);
  assert.equal(snapshot.status, 'canceled');
  assert.equal(snapshot.cancel_at_period_end, true);
});

test('HIGH #7 expired entitlement resolves to expired', () => {
  const snapshot = resolveCustomerSnapshot(
    customerInfo({ expiresDate: '2026-09-01T00:00:00.000Z' }),
    MONTHLY,
  );

  assert.ok(snapshot);
  assert.equal(snapshot.status, 'expired');
  assert.equal(snapshot.cancel_at_period_end, true);
});

test('HIGH #7 refunded subscription cannot remain active', () => {
  const snapshot = resolveCustomerSnapshot(
    customerInfo({ refundedAt: '2026-09-09T15:00:00.000Z' }),
    MONTHLY,
  );

  assert.ok(snapshot);
  assert.equal(snapshot.status, 'expired');
});

test('HIGH #7 missing premium entitlement does not grant Premium', () => {
  const snapshot = resolveCustomerSnapshot(
    customerInfo({ entitlement: false }),
    MONTHLY,
  );

  assert.ok(snapshot);
  assert.equal(snapshot.status, 'expired');
});

test('HIGH #7 missing or invalid request_date_ms fails closed', () => {
  const missing = customerInfo();
  delete missing.request_date_ms;

  assert.equal(resolveCustomerSnapshot(missing, MONTHLY), null);
  assert.equal(
    resolveCustomerSnapshot(customerInfo({ snapshotMs: -1 }), MONTHLY),
    null,
  );
});

test('HIGH #7 webhook fetches Customer Info and writes through atomic RPC', async () => {
  let fetchedUrl = '';
  let fetchedAuth = '';
  let rpcName = '';
  let rpcArgs = null;

  const req = new Request('https://local/revenuecat-webhook', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer webhook-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event: {
        type: 'RENEWAL',
        app_user_id: USER_ID,
        product_id: MONTHLY,
      },
    }),
  });

  const result = await handleWebhook(req, {
    webhookAuthToken: 'webhook-secret',
    revenueCatApiKey: 'rc-secret',
    fetcher: async (input, init) => {
      fetchedUrl = String(input);
      fetchedAuth = String(init?.headers?.Authorization ?? '');

      return new Response(JSON.stringify(customerInfo()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
    admin: {
      rpc: async (name, args) => {
        rpcName = name;
        rpcArgs = args;
        return { data: true, error: null };
      },
    },
  });

  assert.equal(result.status, 200);
  assert.equal(
    fetchedUrl,
    `https://api.revenuecat.com/v1/subscribers/${USER_ID}`,
  );
  assert.equal(fetchedAuth, 'Bearer rc-secret');
  assert.equal(rpcName, 'sync_revenuecat_subscription');
  assert.equal(rpcArgs?.p_user_id, USER_ID);
  assert.equal(rpcArgs?.p_snapshot_at_ms, SNAPSHOT_MS);
  assert.equal(rpcArgs?.p_status, 'active');
  // E-10: the provider is forwarded instead of being hardcoded in the RPC.
  assert.equal(rpcArgs?.p_provider, 'revenuecat');
});

test('E-09 an entitlement without an expiry can never resolve to active', () => {
  const noExpiry = customerInfo({ expiresDate: null, graceDate: null });
  const snapshot = resolveCustomerSnapshot(noExpiry, MONTHLY);

  assert.ok(snapshot);
  assert.equal(snapshot.status, 'expired');
  assert.equal(snapshot.current_period_end, null);
  assert.equal(snapshot.cancel_at_period_end, true);
});

test('E-10 provider is derived from the store, never hardcoded to manual', () => {
  const withStore = (store) => {
    const info = customerInfo();
    info.subscriber.subscriptions[MONTHLY].store = store;
    return info;
  };

  assert.equal(resolveCustomerSnapshot(withStore('app_store'), MONTHLY)?.provider, 'apple');
  assert.equal(resolveCustomerSnapshot(withStore('mac_app_store'), MONTHLY)?.provider, 'apple');
  assert.equal(resolveCustomerSnapshot(withStore('play_store'), MONTHLY)?.provider, 'google');
  assert.equal(resolveCustomerSnapshot(withStore('stripe'), MONTHLY)?.provider, 'revenuecat');
  assert.equal(resolveCustomerSnapshot(withStore('promotional'), MONTHLY)?.provider, 'revenuecat');
  // An unknown store must not be guessed as apple/google, and must not claim the
  // row was operator-granted either.
  assert.equal(resolveCustomerSnapshot(withStore(undefined), MONTHLY)?.provider, 'revenuecat');
  assert.equal(resolveCustomerSnapshot(withStore('mystery_store'), MONTHLY)?.provider, 'revenuecat');
});

test('E-10 webhook event store maps to a schema-valid provider', () => {
  assert.equal(providerForStore('APP_STORE'), 'apple');
  assert.equal(providerForStore('MAC_APP_STORE'), 'apple');
  assert.equal(providerForStore('PLAY_STORE'), 'google');
  assert.equal(providerForStore('AMAZON'), 'revenuecat');
  assert.equal(providerForStore('PROMOTIONAL'), 'revenuecat');
  assert.equal(providerForStore(undefined), 'revenuecat');
  assert.equal(providerForStore('  play_store  '), 'google');
});

test('E-09/E-10 migration fails closed and records provider provenance', () => {
  const sql = readFileSync(
    'supabase/migrations/20260915000300_fail_closed_expiry_and_provider_provenance.sql',
    'utf8',
  );

  // E-10: provider is a parameter, constrained, and never hardcoded.
  assert.match(sql, /p_provider text DEFAULT 'revenuecat'/);
  assert.match(sql, /CHECK \(provider IN \('apple', 'google', 'revenuecat', 'manual'\)\)/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.sync_revenuecat_subscription\(\s*uuid, text, text, text, text, timestamptz, boolean, bigint\s*\)/i);
  // E-09: the NULL branch is gone from the Premium allowance lookup, and an active
  // status without an expiry is downgraded before it is written.
  assert.ok(!/current_period_end IS NULL OR s\.current_period_end > v_now/.test(sql));
  assert.ok(!/current_period_end IS NULL OR/.test(sql));
  assert.match(sql, /AND s\.current_period_end > v_now/);
  assert.match(sql, /p_current_period_end IS NULL THEN\s*p_status := 'expired'/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/);
});

test('HIGH #7 RevenueCat failure fails closed and never writes subscription', async () => {
  let rpcCalls = 0;

  const req = new Request('https://local/revenuecat-webhook', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer webhook-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event: {
        type: 'RENEWAL',
        app_user_id: USER_ID,
        product_id: MONTHLY,
      },
    }),
  });

  const result = await handleWebhook(req, {
    webhookAuthToken: 'webhook-secret',
    revenueCatApiKey: 'rc-secret',
    fetcher: async () => new Response('upstream failure', { status: 500 }),
    admin: {
      rpc: async () => {
        rpcCalls += 1;
        return { data: true, error: null };
      },
    },
  });

  assert.equal(result.status, 502);
  assert.equal(rpcCalls, 0);
});

test('HIGH #7 migration applies only strictly newer snapshots', () => {
  const sql = readFileSync(
    'supabase/migrations/20260909000200_harden_revenuecat_subscription_sync.sql',
    'utf8',
  );

  assert.match(sql, /ADD COLUMN revenuecat_snapshot_at_ms bigint/i);
  assert.match(sql, /ON CONFLICT\s*\(user_id\)\s*DO UPDATE/i);
  assert.match(
    sql,
    /EXCLUDED\.revenuecat_snapshot_at_ms\s*>\s*public\.subscriptions\.revenuecat_snapshot_at_ms/i,
  );
  assert.match(sql, /SECURITY DEFINER/i);
  assert.match(
    sql,
    /GRANT EXECUTE ON FUNCTION public\.sync_revenuecat_subscription[\s\S]*TO service_role/i,
  );
  assert.match(
    sql,
    /REVOKE ALL ON FUNCTION public\.sync_revenuecat_subscription[\s\S]*FROM PUBLIC, anon, authenticated/i,
  );
});

test('HIGH #7 webhook no longer directly upserts subscriptions', () => {
  const source = readFileSync(
    'supabase/functions/revenuecat-webhook/core.ts',
    'utf8',
  );

  const handlerStart = source.indexOf('export async function handleWebhook');
  assert.ok(handlerStart >= 0);

  const handler = source.slice(handlerStart);

  assert.ok(!handler.includes(".from('subscriptions')"));
  assert.ok(!handler.includes('.upsert('));
  assert.ok(handler.includes("rpc('sync_revenuecat_subscription'"));
});

test('HIGH #7 server config requires secret RevenueCat API key', () => {
  const index = readFileSync(
    'supabase/functions/revenuecat-webhook/index.ts',
    'utf8',
  );
  const env = readFileSync('.env.example', 'utf8');

  assert.ok(index.includes("Deno.env.get('REVENUECAT_API_KEY')"));
  assert.ok(index.includes('revenueCatApiKey'));
  assert.ok(
    env.includes(
      'REVENUECAT_API_KEY=REPLACE_WITH_REVENUECAT_SECRET_API_KEY',
    ),
  );
  assert.ok(!env.includes('EXPO_PUBLIC_REVENUECAT_API_KEY'));
});

// ---------------------------------------------------------------------------
// T6 / R3 + U1b - testele cerute de taskul de premium (10.10.2026)
//
// Ce se dovedeste aici, la nivel de functia webhook:
//   (a) un eveniment `environment = 'sandbox'` SCRIE randul (acceptarea sandbox e permanenta in
//       cod, nu depinde de vreun flag de mediu) - inainte raspundea 200 {skipped:true} si nu
//       scria nimic, exact in TestFlight, unde se face testarea;
//   (b) un produs cu sufixul de Google Play (`<id>:<basePlanId>`) scrie randul;
//   (c) un id de produs pe care codul nu il cunoaste, dar cu entitlement-ul `premium` in
//       Customer Info, scrie randul (id viitor, fara schimbare de cod);
//   (d) un produs necunoscut FARA entitlement premium: NU scrie nimic, dar id-ul apare in log
//       si in raspuns (fara tacere si fara "success" orbeste).
// ---------------------------------------------------------------------------

const PLAY_MONTHLY = 'ro.ortodoxia.premium.monthly:monthly';
const PLAY_ANNUAL = 'ro.ortodoxia.premium.annual:annual';
const FUTURE_IOS = 'ro.ortodoxia.premium.yearly.v2';

function webhookRequest(event) {
  return new Request('https://local/revenuecat-webhook', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer webhook-secret',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event }),
  });
}

function webhookDeps({ customerInfoPayload, onRpc }) {
  return {
    webhookAuthToken: 'webhook-secret',
    revenueCatApiKey: 'rc-secret',
    fetcher: async () =>
      new Response(JSON.stringify(customerInfoPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    admin: {
      rpc: async (name, args) => {
        onRpc?.(name, args);
        return { data: true, error: null };
      },
    },
  };
}

test('T6/R3 sandbox event writes the subscription row (no environment flag needed)', async () => {
  let rpcArgs = null;
  const result = await handleWebhook(
    webhookRequest({
      type: 'INITIAL_PURCHASE',
      app_user_id: USER_ID,
      product_id: MONTHLY,
      store: 'APP_STORE',
      environment: 'sandbox',
    }),
    webhookDeps({
      customerInfoPayload: customerInfo(),
      onRpc: (_name, args) => {
        rpcArgs = args;
      },
    }),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.applied, true);
  assert.equal(result.body.skipped, undefined);
  assert.ok(rpcArgs, 'RPC-ul trebuie apelat pentru un eveniment de sandbox');
  assert.equal(rpcArgs.p_environment, 'sandbox');
  assert.equal(rpcArgs.p_status, 'active');
  assert.equal(rpcArgs.p_user_id, USER_ID);
});

test('T6/U1b(b) Play-suffixed product id writes the row', async () => {
  // Customer Info as RevenueCat returns it for a Play purchase: the subscription is keyed by
  // the Play id and carries `store: 'play_store'` (the provider is derived from there).
  const playInfo = customerInfo({ productId: PLAY_MONTHLY });
  playInfo.subscriber.subscriptions[PLAY_MONTHLY].store = 'play_store';

  let rpcArgs = null;
  const result = await handleWebhook(
    webhookRequest({
      type: 'INITIAL_PURCHASE',
      app_user_id: USER_ID,
      product_id: PLAY_MONTHLY,
      store: 'PLAY_STORE',
      environment: 'production',
    }),
    webhookDeps({
      customerInfoPayload: playInfo,
      onRpc: (_name, args) => {
        rpcArgs = args;
      },
    }),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.applied, true);
  assert.ok(rpcArgs, 'RPC-ul trebuie apelat pentru un produs cu sufix Play');
  assert.equal(rpcArgs.p_product_id, PLAY_MONTHLY);
  assert.equal(rpcArgs.p_plan, 'monthly');
  assert.equal(rpcArgs.p_provider, 'google');
  assert.equal(rpcArgs.p_environment, 'production');

  // aceeasi regula si pentru varianta anuala
  const annual = resolveCustomerSnapshot(
    customerInfo({ productId: PLAY_ANNUAL }),
    PLAY_ANNUAL,
  );
  assert.ok(annual);
  assert.equal(annual.status, 'active');
  assert.equal(annual.plan, 'annual');
});

test('T6/U1b(a) future product id with the premium entitlement still grants Premium', async () => {
  // Un id pe care codul nu il cunoaste (produs viitor), dar RevenueCat il raporteaza in
  // entitlement-ul `premium`: inainte de corectie, `resolveCustomerSnapshot` intorcea null si
  // webhook-ul raspundea 502 "Raspuns RevenueCat invalid." - o achizitie reala, pierduta.
  const snapshot = resolveCustomerSnapshot(customerInfo({ productId: FUTURE_IOS }), FUTURE_IOS);
  assert.ok(snapshot, 'entitlement-ul premium trebuie sa fie suficient pentru un id nou');
  assert.equal(snapshot.status, 'active');
  assert.equal(snapshot.product_id, FUTURE_IOS);

  let rpcArgs = null;
  const result = await handleWebhook(
    webhookRequest({
      type: 'INITIAL_PURCHASE',
      app_user_id: USER_ID,
      product_id: FUTURE_IOS,
      entitlement_ids: ['premium'],
      store: 'APP_STORE',
      environment: 'production',
    }),
    webhookDeps({
      customerInfoPayload: customerInfo({ productId: FUTURE_IOS }),
      onRpc: (_name, args) => {
        rpcArgs = args;
      },
    }),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.applied, true);
  assert.ok(rpcArgs, 'RPC-ul trebuie apelat pentru un id viitor cu entitlement premium');
  assert.equal(rpcArgs.p_product_id, FUTURE_IOS);
  assert.equal(rpcArgs.p_status, 'active');
});

test('T6/U1b(c) unknown product without the premium entitlement is logged, never written', async () => {
  const unknown = 'ro.romarg.ceva.necunoscut:base';
  let rpcCalls = 0;
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => {
    warnings.push(
      args
        .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
        .join(' '),
    );
  };

  let result;
  try {
    result = await handleWebhook(
      webhookRequest({
        type: 'INITIAL_PURCHASE',
        app_user_id: USER_ID,
        product_id: unknown,
        entitlement_ids: [],
        store: 'APP_STORE',
      }),
      webhookDeps({
        // Customer Info fara entitlement-ul premium: nu exista nicio dovada de Premium.
        customerInfoPayload: customerInfo({ entitlement: false }),
        onRpc: () => {
          rpcCalls += 1;
        },
      }),
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.equal(result.status, 200);
  assert.equal(result.body.success, false);
  assert.equal(result.body.ignored, true);
  assert.equal(result.body.reason, 'unknown_product');
  assert.equal(result.body.product_id, unknown);
  assert.equal(rpcCalls, 0, 'un produs necunoscut nu are voie sa scrie in baza');
  assert.ok(
    warnings.some((line) => line.includes(unknown)),
    'id-ul necunoscut trebuie sa apara explicit in log',
  );
});

test('T6/R3 sandbox acceptance is in code, not behind an environment flag', () => {
  const core = readFileSync('supabase/functions/revenuecat-webhook/core.ts', 'utf8');
  const index = readFileSync('supabase/functions/revenuecat-webhook/index.ts', 'utf8');

  const code = core
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');

  assert.ok(!/REVENUECAT_ACCEPT_SANDBOX/.test(code), 'codul nu are voie sa citeasca acest flag');
  assert.ok(!/acceptsSandboxEvents/.test(core));
  assert.ok(!/sandbox_event_ignored/.test(code));
  assert.ok(!/REVENUECAT_ACCEPT_SANDBOX/.test(index));
  // environment-ul este totusi inregistrat pe rand
  assert.match(core, /p_environment: environment/);
});
