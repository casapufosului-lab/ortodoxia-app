import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  handleWebhook,
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