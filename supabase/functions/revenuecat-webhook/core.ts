/**
 * Miez logic reutilizabil pentru webhook-ul RevenueCat.
 *
 * Acest modul este agnostic de runtime: nu importa Deno nici clientul Supabase,
 * pentru a putea fi testat local (Node) fară apeluri reale către RevenueCat sau
 * Supabase. `index.ts` îl folosește în Edge Function (Deno).
 *
 * Reguli de securitate aplicate aici:
 *  - Se acceptă numai POST (verificat în `handleWebhook`).
 *  - Se verifică `Authorization: Bearer <token>` împotriva secretului server.
 *  - `app_user_id` trebuie să fie un UUID valid.
 *  - Produsele se decid ÎNTÂI după entitlement (`premium`), apoi după lista explicită de
 *    id-uri (`ro.ortodoxia.premium.*`, inclusiv formele Google Play `<id>:<basePlan>`).
 *  - Evenimentele `sandbox` sunt acceptate PERMANENT, în cod (R3, 10.10.2026), și se
 *    înregistrează pe rând prin coloana `environment`.
 *  - Starea finala vine din Customer Info RevenueCat si se scrie atomic dupa snapshot.
 *  - Nu se loghează date personale, tokenuri sau payloaduri complete.
 */

export const ACCEPTED_PRODUCTS = [
  'ro.ortodoxia.premium.monthly',
  'ro.ortodoxia.premium.annual',
] as const;

export const PRODUCT_PLAN: Record<string, 'monthly' | 'annual'> = {
  'ro.ortodoxia.premium.monthly': 'monthly',
  'ro.ortodoxia.premium.annual': 'annual',
};

export const ACCEPTED_PRODUCT_SET: ReadonlySet<string> = new Set(ACCEPTED_PRODUCTS);

/**
 * U1b — the entitlement that means "Premium", from RevenueCat (`entlaa729d7f5c`).
 *
 * All six products (App Store, Play, web) hang off this one entitlement, so matching
 * on it grants Premium for the App Store, for Google Play and for any product id
 * added later, without a code change. It is checked BEFORE the product list; the
 * product list stays as the fallback for events that arrive without entitlements.
 */
export const PREMIUM_ENTITLEMENT_ID = 'premium';

/**
 * Environment reported by RevenueCat for a purchase: `sandbox` or `production`.
 *
 * R3 (10.10.2026) — sandbox acceptance is PERMANENT, in code. There is no
 * `REVENUECAT_ACCEPT_SANDBOX` switch any more and nothing has to be configured in
 * Supabase: TestFlight and Play internal testing are exactly how this app is
 * verified before release, and a sandbox receipt cannot be fabricated by a third
 * party. Until this change the switch defaulted to `false`, so every TestFlight
 * purchase was answered `200 {skipped:true, reason:'sandbox_event_ignored'}` and
 * wrote no row while Apple had already charged the tester — the failure reported by
 * the owner on 10.10.2026.
 *
 * The value is still recorded on the subscription row (column `environment`), so an
 * entitlement that came from a sandbox purchase is never indistinguishable from a
 * paid production one.
 */
export function normalizeEnvironment(raw: unknown): 'sandbox' | 'production' | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  if (value === 'sandbox') return 'sandbox';
  if (value === 'production') return 'production';
  return null;
}

/**
 * Google Play sells subscriptions as `<productId>:<basePlanId>`, and RevenueCat
 * reports that whole string as `product_id` (`ro.ortodoxia.premium.monthly:monthly`).
 * The base plan is Play's own naming, not ours, so only the part before the colon is
 * matched against the products this app owns.
 */
export function baseProductId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  const colon = trimmed.indexOf(':');
  return colon > 0 ? trimmed.slice(0, colon) : trimmed;
}

/** True when the id (or its base, for Play) is one of the products this app sells. */
export function isKnownProduct(raw: unknown): boolean {
  const base = baseProductId(raw);
  return base.length > 0 && ACCEPTED_PRODUCT_SET.has(base);
}

/** Plan recorded for a product id; unknown ids keep the historical `monthly` default. */
export function planForProduct(raw: unknown): 'monthly' | 'annual' {
  return PRODUCT_PLAN[baseProductId(raw)] ?? 'monthly';
}

/**
 * Event types RevenueCat sends that can change entitlement state.
 *
 * The keys are only an ACCEPT FILTER: the status actually written comes from the live
 * Customer Info snapshot (`resolveCustomerSnapshot`), so a listed type can never grant
 * Premium on its own. Gaps here matter anyway, because an unlisted type is dropped
 * before the snapshot is fetched — the row then keeps a stale status until some other
 * event happens to arrive.
 *
 * Previously missing, and now covered:
 *   TRANSFER                     — the subscription moved to another app user id;
 *   SUBSCRIPTION_PAUSED          — access stops, so the snapshot yields expired;
 *   SUBSCRIPTION_EXTENDED        — the period end moved out;
 *   TEMPORARY_ENTITLEMENT_GRANT  — RevenueCat support granted access manually;
 *   NON_RENEWING_PURCHASE        — a one-off purchase that may carry an entitlement;
 *   SUBSCRIPTION_UNPAUSED, EXPIRATION_* variants and PURCHASE_* are listed for the
 *   same reason: reconcile from the snapshot rather than guessing.
 */
const EVENT_STATUS_MAP: Record<string, string> = {
  INITIAL_PURCHASE: 'active',
  RENEWAL: 'active',
  CANCELLATION: 'canceled',
  UNCANCELLATION: 'active',
  EXPIRATION: 'expired',
  BILLING_ISSUE: 'active',
  SUBSCRIBED: 'active',
  PRODUCT_CHANGE: 'active',
  REVOKE: 'expired',
  TRANSFER: 'active',
  SUBSCRIPTION_PAUSED: 'expired',
  SUBSCRIPTION_UNPAUSED: 'active',
  SUBSCRIPTION_EXTENDED: 'active',
  TEMPORARY_ENTITLEMENT_GRANT: 'active',
  NON_RENEWING_PURCHASE: 'active',
};

export type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  product_id?: string;
  period_start?: string;
  period_end?: string;
  entitlement_id?: string;
  /** RevenueCat's newer events carry a list; older payloads carry the singular id. */
  entitlement_ids?: string[];
  expiration_at_ms?: number;
  original_transaction_id?: string;
  environment?: string;
  /**
   * E-10: the store the purchase belongs to. Declared by RevenueCat ("Sometimes"
   * included) with the values AMAZON, APP_STORE, MAC_APP_STORE, PADDLE,
   * PLAY_STORE, PROMOTIONAL, RC_BILLING, ROKU, STRIPE, TEST_STORE.
   * See https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields
   */
  store?: string;
};

/**
 * Entitlement ids carried by the event, as a list.
 *
 * RevenueCat sends `entitlement_ids` (array) on webhook events and the singular
 * `entitlement_id` on some payloads; both shapes are read so the entitlement-first
 * rule (U1b) holds whichever arrives. Values are compared case-insensitively.
 */
export function entitlementIdsOf(event: RevenueCatEvent): string[] {
  const ids: string[] = [];
  if (Array.isArray(event.entitlement_ids)) {
    for (const raw of event.entitlement_ids) {
      if (typeof raw === 'string' && raw.trim().length > 0) ids.push(raw.trim().toLowerCase());
    }
  }
  if (typeof event.entitlement_id === 'string' && event.entitlement_id.trim().length > 0) {
    ids.push(event.entitlement_id.trim().toLowerCase());
  }
  return ids;
}

/**
 * Provider values accepted by `public.subscriptions.provider`.
 *
 * `apple` / `google` mean the store was positively identified. `revenuecat` means
 * the entitlement was verified through RevenueCat but the store is not one of the
 * two mobile stores (web billing, promotional grant, or the field was absent).
 * `manual` is reserved for rows an operator wrote by hand — the webhook must never
 * produce it, because doing so erased the provenance of every real purchase (E-10).
 */
export type SubscriptionProvider = 'apple' | 'google' | 'revenuecat' | 'manual';

/** Customer Info `store` values are lower_snake_case; webhook `store` is UPPER_SNAKE. */
const STORE_PROVIDER: Record<string, SubscriptionProvider> = {
  APP_STORE: 'apple',
  MAC_APP_STORE: 'apple',
  PLAY_STORE: 'google',
  AMAZON: 'revenuecat',
  STRIPE: 'revenuecat',
  PADDLE: 'revenuecat',
  RC_BILLING: 'revenuecat',
  ROKU: 'revenuecat',
  PROMOTIONAL: 'revenuecat',
  TEST_STORE: 'revenuecat',
};

/**
 * Map a RevenueCat store identifier to a schema-valid provider.
 *
 * Unknown or missing stores map to `revenuecat`, never to `manual`: the purchase
 * really did come through RevenueCat, and guessing `apple`/`google` would fabricate
 * store provenance that no audit could later contradict.
 */
export function providerForStore(store: unknown): SubscriptionProvider {
  if (typeof store !== 'string') return 'revenuecat';
  return STORE_PROVIDER[store.trim().toUpperCase()] ?? 'revenuecat';
}

export type SubscriptionUpdate = {
  status: string;
  plan: 'monthly' | 'annual';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  product_id: string;
  provider_subscription_id: string | null;
  provider: SubscriptionProvider;
};

export type RevenueCatCustomerInfo = {
  request_date_ms?: number;
  subscriber?: {
    entitlements?: Record<string, {
      expires_date?: string | null;
      grace_period_expires_date?: string | null;
      product_identifier?: string;
    }>;
    subscriptions?: Record<string, {
      expires_date?: string | null;
      grace_period_expires_date?: string | null;
      unsubscribe_detected_at?: string | null;
      refunded_at?: string | null;
      period_type?: string | null;
      store_transaction_id?: string | number | null;
      /**
       * E-10: store that owns the subscription, lower_snake_case
       * (`app_store`, `play_store`, `promotional`, `stripe`, …).
       */
      store?: string | null;
      /**
       * T3 (10.10.2026) — `true` when RevenueCat served this subscription from a sandbox
       * (test) purchase. Confirmed present in the live v1 payload of this project on
       * 10.10.2026 (`store=app_store`, `is_sandbox=true`); it is the only environment signal
       * that v1 gives us, because the v1 subscriber payload carries no `environment` field of
       * its own — only the webhook event does. `revenuecat-sync-user` reads it to fill the
       * row's `environment` column, so an entitlement that came from a sandbox purchase is
       * never recorded as if it were a paid production one.
       */
      is_sandbox?: boolean | null;
    }>;
  };
};

/**
 * T3 (10.10.2026) — the `subscriber.subscriptions` entry for a product id.
 *
 * Extracted from `resolveCustomerSnapshot` so the webhook and `revenuecat-sync-user` resolve a
 * subscription the same way from one implementation: Customer Info keys `subscriptions` by the
 * exact product id RevenueCat reports, which for Google Play carries the base plan
 * (`ro.ortodoxia.premium.monthly:monthly`). The exact key is tried first, then the base id, then
 * the optional fallback the caller passed in.
 */
export type RevenueCatSubscriptionInfo = NonNullable<
  NonNullable<RevenueCatCustomerInfo['subscriber']>['subscriptions']
>[string];

export function findSubscription(
  customerInfo: RevenueCatCustomerInfo,
  productId: string,
  fallbackProductId?: string,
): RevenueCatSubscriptionInfo | undefined {
  const subscriptions = customerInfo.subscriber?.subscriptions ?? {};
  return (
    subscriptions[productId] ??
    subscriptions[baseProductId(productId)] ??
    (fallbackProductId ? subscriptions[fallbackProductId] : undefined)
  );
}

export type RevenueCatSnapshot = SubscriptionUpdate & {
  snapshot_at_ms: number;
};

export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Stabilește statusul de bază pentru un tip de eveniment. */
export function getEventType(type: string | undefined): string | null {
  if (!type) return null;
  return EVENT_STATUS_MAP[type] ?? null;
}

/**
 * Compară tokenul primit cu cel așteptat într-un mod rezistent la timing attacks.
 * Acceptă fie `Authorization: Bearer <token>`, fie tokenul brut.
 */
export function authorizeRequest(authHeader: string | null, expectedToken: string): boolean {
  if (!authHeader || !expectedToken) return false;
  let candidate = authHeader;
  if (candidate.startsWith('Bearer ')) {
    candidate = candidate.slice('Bearer '.length);
  }
  if (candidate.length !== expectedToken.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedToken.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expectedToken.charCodeAt(i);
  }
  return diff === 0;
}

function normalizePeriodEnd(event: RevenueCatEvent): string | null {
  if (event.period_end) {
    const time = new Date(event.period_end).getTime();
    if (!Number.isNaN(time)) return new Date(time).toISOString();
  }
  if (typeof event.expiration_at_ms === 'number' && !Number.isNaN(event.expiration_at_ms)) {
    return new Date(event.expiration_at_ms).toISOString();
  }
  return null;
}


/** Categorizează evenimentul în tipul de acțiune (activ / anulare / expirare). */
function actionForType(eventType: string): 'active' | 'canceled' | 'expired' | null {
  switch (eventType) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
    case 'UNCANCELLATION':
    case 'BILLING_ISSUE':
    case 'SUBSCRIBED':
    case 'PRODUCT_CHANGE':
      return 'active';
    case 'CANCELLATION':
      return 'canceled';
    case 'EXPIRATION':
    case 'REVOKE':
      return 'expired';
    default:
      return null;
  }
}

/**
 * Rezolvă ce actualizare se aplică unui abonament pentru un event.
 * Produsele necunoscute nu acordă Premium (returnează `null`).
 *
 * Atenție: regula U1b (entitlement-ul `premium` întâi) se aplică în handler, înainte
 * de rezolvare — aici se ajunge numai după ce produsul a fost recunoscut.
 */
export function resolveSubscriptionUpdate(
  eventType: string,
  productId: string,
  event: RevenueCatEvent,
): SubscriptionUpdate | null {
  if (!isKnownProduct(productId)) return null;
  const plan = planForProduct(productId);
  const action = actionForType(eventType);
  if (!action) return null;

  const currentPeriodEnd = normalizePeriodEnd(event);
  const providerSubscriptionId = event.original_transaction_id ?? null;
  const provider = providerForStore(event.store);

  switch (action) {
    case 'active':
      return {
        status: 'active',
        plan,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: false,
        product_id: productId,
        provider_subscription_id: providerSubscriptionId,
        provider,
      };
    case 'canceled':
      return {
        status: 'canceled',
        plan,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: true,
        product_id: productId,
        provider_subscription_id: providerSubscriptionId,
        provider,
      };
    case 'expired':
      return {
        status: 'expired',
        plan,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: true,
        product_id: productId,
        provider_subscription_id: providerSubscriptionId,
        provider,
      };
    default:
      return null;
  }
}


/** Construiește rândul care se va upsert în `subscriptions`. */
export function buildUpsertRow(
  appUserId: string,
  update: SubscriptionUpdate,
): Record<string, unknown> {
  return {
    user_id: appUserId,
    status: update.status,
    plan: update.plan,
    provider: update.provider,
    product_id: update.product_id,
    provider_subscription_id: update.provider_subscription_id,
    current_period_end: update.current_period_end,
    cancel_at_period_end: update.cancel_at_period_end,
  };
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function latestPeriodEnd(...values: unknown[]): string | null {
  let latest: { time: number; iso: string } | null = null;
  for (const value of values) {
    const iso = normalizeIsoDate(value);
    if (!iso) continue;
    const time = new Date(iso).getTime();
    if (!latest || time > latest.time) latest = { time, iso };
  }
  return latest?.iso ?? null;
}

export function resolveCustomerSnapshot(
  customerInfo: RevenueCatCustomerInfo,
  fallbackProductId: string,
): RevenueCatSnapshot | null {
  const snapshotAtMs = customerInfo.request_date_ms;
  if (typeof snapshotAtMs !== 'number' || !Number.isSafeInteger(snapshotAtMs) || snapshotAtMs <= 0) return null;

  const entitlement = customerInfo.subscriber?.entitlements?.premium;
  const entitlementProductId =
    typeof entitlement?.product_identifier === 'string' ? entitlement.product_identifier : '';
  // U1b(a) — ENTITLEMENT-FIRST, also inside the snapshot.
  //
  // Before this change the snapshot only accepted a product id from the two-id list, so an
  // event that named the `premium` entitlement (accepted by `handleWebhook`) but arrived with a
  // product id we had never seen — a future App Store product, or Play's
  // `<productId>:<basePlanId>` form — was answered `502 Raspuns RevenueCat invalid.` and wrote
  // nothing: a real purchase, silently lost, exactly what U1b forbids.
  //
  // Now the entitlement RevenueCat reports is authoritative whenever it carries a product
  // identifier (`entitlementProductId.length > 0`) or names a product we know. Fail-closed rules
  // are untouched: an entitlement with no readable expiry still resolves to `expired` below
  // (E-09), and `handleWebhook` still refuses an event that has neither the `premium` entitlement
  // nor a known product id.
  const entitlementKnownProduct = isKnownProduct(entitlementProductId);
  const entitlementReported =
    Boolean(entitlement) && (entitlementKnownProduct || entitlementProductId.length > 0);
  const productId = entitlementReported ? entitlementProductId : fallbackProductId;
  if (!isKnownProduct(productId) && !entitlementReported) return null;
  // T3 (10.10.2026) — the lookup itself now lives in `findSubscription` above, shared with
  // `revenuecat-sync-user`, so the row the webhook writes and the row the sync function writes
  // are always resolved from the same key rules.
  const subscription = findSubscription(customerInfo, productId, fallbackProductId);
  const currentPeriodEnd = latestPeriodEnd(
    entitlement?.expires_date,
    entitlement?.grace_period_expires_date,
    subscription?.expires_date,
    subscription?.grace_period_expires_date,
  );
  const currentPeriodEndMs = currentPeriodEnd ? new Date(currentPeriodEnd).getTime() : null;
  const refunded = typeof subscription?.refunded_at === 'string' && subscription.refunded_at.length > 0;
  // E-09: this used to be `currentPeriodEndMs === null || currentPeriodEndMs > snapshotAtMs`,
  // so an entitlement with no expiry at all resolved to `active` with
  // `current_period_end = NULL` — and both the client (`hasPremiumAccess`) and the
  // server quota gate (`reserve_ai_request`) then treated a NULL period end as
  // "never expires". A missing expiry now yields `expired` (fail closed). Both
  // accepted products are time-limited subscriptions, so a real purchase always
  // carries an expiry.
  const active =
    Boolean(entitlement) &&
    entitlementReported &&
    !refunded &&
    currentPeriodEndMs !== null &&
    currentPeriodEndMs > snapshotAtMs;
  let status: string;

  if (!active) {
    status = 'expired';
  } else if (typeof subscription?.unsubscribe_detected_at === 'string' && subscription.unsubscribe_detected_at.length > 0) {
    status = 'canceled';
  } else if (subscription?.period_type === 'trial') {
    status = 'trialing';
  } else {
    status = 'active';
  }

  const providerSubscriptionId =
    subscription?.store_transaction_id === null || subscription?.store_transaction_id === undefined
      ? null
      : String(subscription.store_transaction_id);

  return {
    status,
    plan: planForProduct(productId),
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: status === 'canceled' || status === 'expired',
    product_id: productId,
    provider_subscription_id: providerSubscriptionId,
    // E-10: the provider comes from the store RevenueCat reports for this
    // subscription, not from a hardcoded 'manual'.
    provider: providerForStore(subscription?.store),
    snapshot_at_ms: snapshotAtMs,
  };
}

export type WebhookDeps = {
  webhookAuthToken: string | null;
  revenueCatApiKey: string | null;
  fetcher: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  admin: {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown | null }>;
  };
};

export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * Gestionează o cerere webhook. Returnează un rezultat `{ status, body }`
 * care poate fi convertit într-un `Response` de către apelant (Deno/Edge).
 * Citeste starea curenta din RevenueCat prin `deps.fetcher` si modifica baza doar prin
 * `deps.admin` (injectat), deci poate fi testat local cu un admin mock.
 */
export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<WebhookResult> {
  if (req.method !== 'POST') {
    return { status: 405, body: { error: 'Metoda neacceptata.' } };
  }

  if (!deps.webhookAuthToken || !deps.revenueCatApiKey) {
    return { status: 503, body: { error: 'Serviciul nu este configurat.' } };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authorizeRequest(authHeader, deps.webhookAuthToken)) {
    return { status: 401, body: { error: 'Acces neautorizat.' } };
  }

  let body: { event?: RevenueCatEvent };
  try {
    body = (await req.json()) as { event?: RevenueCatEvent };
  } catch {
    return { status: 400, body: { error: 'Cererea nu este valida.' } };
  }

  const event = body?.event;
  if (!event || typeof event !== 'object') {
    return { status: 400, body: { error: 'Eveniment invalid.' } };
  }

  const appUserId = event.app_user_id;
  if (typeof appUserId !== 'string' || !isValidUUID(appUserId)) {
    return { status: 400, body: { error: 'Identificator utilizator invalid.' } };
  }

  const eventType = getEventType(event.type);
  if (!eventType) {
    // Eveniment de tip necunoscut/irelevant — ignorat, dar SPUS explicit în răspuns.
    // (Înainte răspundea `success:true`, ceea ce ascundea un tip de eveniment pe care
    // nu îl tratăm.)
    return {
      status: 200,
      body: {
        success: false,
        ignored: true,
        reason: 'unsupported_event_type',
        event_type: typeof event.type === 'string' ? event.type : null,
      },
    };
  }

  // R3 — environment (sandbox / production).
  //
  // The event's environment is RECORDED on the row (column `environment`), never used to
  // drop the event: sandbox acceptance is permanent, in code, for the reasons spelled out
  // on `normalizeEnvironment`. Before this change a sandbox event was answered
  // `200 {skipped:true, reason:'sandbox_event_ignored'}` and wrote nothing — a TestFlight
  // purchase looked failed in RevenueCat exactly while Apple had charged the tester.
  const environment = normalizeEnvironment(event.environment);

  // U1b — who may grant Premium.
  //
  //   (a) the event names the `premium` entitlement → grant. Store- and id-agnostic, so
  //       an App Store, Google Play or future product works without a code change;
  //   (b) otherwise a `product_id` we know, including Play's `<productId>:<basePlanId>`
  //       form (`ro.ortodoxia.premium.monthly:monthly`) → grant.
  //
  // Anything else is refused AND logged with the id: the old code answered a bare
  // `200 {success:true, skipped:true}` for an unlisted product, so a real purchase could
  // disappear with no trace in the logs and no error in RevenueCat.
  const entitlementIds = entitlementIdsOf(event);
  const rawProductId = typeof event.product_id === 'string' ? event.product_id.trim() : '';
  const hasPremiumEntitlement = entitlementIds.includes(PREMIUM_ENTITLEMENT_ID);
  if (!hasPremiumEntitlement && !isKnownProduct(rawProductId)) {
    console.warn(
      '[revenuecat-webhook] eveniment ignorat: produs necunoscut si fara entitlement premium',
      { productId: rawProductId || null, entitlementIds, environment },
    );
    return {
      status: 200,
      body: {
        success: false,
        ignored: true,
        reason: 'unknown_product',
        product_id: rawProductId || null,
        entitlement_ids: entitlementIds,
      },
    };
  }

  const productId = rawProductId;

  let response: Response;
  try {
    response = await deps.fetcher(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${deps.revenueCatApiKey}`,
        },
      },
    );
  } catch {
    return { status: 502, body: { error: 'Sincronizarea RevenueCat nu a reusit.' } };
  }

  if (!response.ok) {
    return { status: 502, body: { error: 'Sincronizarea RevenueCat nu a reusit.' } };
  }

  let customerInfo: RevenueCatCustomerInfo;
  try {
    customerInfo = (await response.json()) as RevenueCatCustomerInfo;
  } catch {
    return { status: 502, body: { error: 'Sincronizarea RevenueCat nu a reusit.' } };
  }

  const snapshot = resolveCustomerSnapshot(customerInfo, productId);
  if (!snapshot) {
    return { status: 502, body: { error: 'Raspuns RevenueCat invalid.' } };
  }

  const { data, error } = await deps.admin.rpc('sync_revenuecat_subscription', {
    p_user_id: appUserId,
    p_status: snapshot.status,
    p_plan: snapshot.plan,
    p_product_id: snapshot.product_id,
    p_provider_subscription_id: snapshot.provider_subscription_id,
    p_current_period_end: snapshot.current_period_end,
    p_cancel_at_period_end: snapshot.cancel_at_period_end,
    p_snapshot_at_ms: snapshot.snapshot_at_ms,
    p_provider: snapshot.provider,
    // R3/3: the environment the purchase really happened in, stored on the row.
    p_environment: environment,
  });

  if (error) {
    // Nu logăm detalii personale; doar un mesaj generic.
    return { status: 500, body: { error: 'Actualizarea nu a reusit.' } };
  }

  if (data === false) {
    // The RPC refuses to overwrite a row with an older snapshot. Say so, instead of
    // reporting a write that did not happen.
    return {
      status: 200,
      body: { success: false, applied: false, reason: 'stale_snapshot' },
    };
  }

  return {
    status: 200,
    body: {
      success: true,
      applied: true,
      status: snapshot.status,
      plan: snapshot.plan,
      environment,
    },
  };
}

