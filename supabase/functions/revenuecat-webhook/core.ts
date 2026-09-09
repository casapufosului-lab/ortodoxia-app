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
 *  - Se acceptă produsele doar din lista explicită (`ro.ortodoxia.premium.*`).
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

/** Event types RevenueCat → status-ul rândului de abonament. */
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
};

export type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  product_id?: string;
  period_start?: string;
  period_end?: string;
  entitlement_id?: string;
  expiration_at_ms?: number;
  original_transaction_id?: string;
  environment?: string;
};

export type SubscriptionUpdate = {
  status: string;
  plan: 'monthly' | 'annual';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  product_id: string;
  provider_subscription_id: string | null;
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
    }>;
  };
};

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
 */
export function resolveSubscriptionUpdate(
  eventType: string,
  productId: string,
  event: RevenueCatEvent,
): SubscriptionUpdate | null {
  if (!ACCEPTED_PRODUCT_SET.has(productId)) return null;
  const plan = PRODUCT_PLAN[productId] ?? 'monthly';
  const action = actionForType(eventType);
  if (!action) return null;

  const currentPeriodEnd = normalizePeriodEnd(event);
  const providerSubscriptionId = event.original_transaction_id ?? null;

  switch (action) {
    case 'active':
      return {
        status: 'active',
        plan,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: false,
        product_id: productId,
        provider_subscription_id: providerSubscriptionId,
      };
    case 'canceled':
      return {
        status: 'canceled',
        plan,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: true,
        product_id: productId,
        provider_subscription_id: providerSubscriptionId,
      };
    case 'expired':
      return {
        status: 'expired',
        plan,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: true,
        product_id: productId,
        provider_subscription_id: providerSubscriptionId,
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
    provider: 'manual',
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
  const entitlementProductAccepted = ACCEPTED_PRODUCT_SET.has(entitlementProductId);
  const productId = entitlementProductAccepted ? entitlementProductId : fallbackProductId;
  if (!ACCEPTED_PRODUCT_SET.has(productId)) return null;

  const subscription = customerInfo.subscriber?.subscriptions?.[productId];
  const currentPeriodEnd = latestPeriodEnd(
    entitlement?.expires_date,
    entitlement?.grace_period_expires_date,
    subscription?.expires_date,
    subscription?.grace_period_expires_date,
  );
  const currentPeriodEndMs = currentPeriodEnd ? new Date(currentPeriodEnd).getTime() : null;
  const refunded = typeof subscription?.refunded_at === 'string' && subscription.refunded_at.length > 0;
  const active =
    Boolean(entitlement) &&
    entitlementProductAccepted &&
    !refunded &&
    (currentPeriodEndMs === null || currentPeriodEndMs > snapshotAtMs);

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
    plan: PRODUCT_PLAN[productId] ?? 'monthly',
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: status === 'canceled' || status === 'expired',
    product_id: productId,
    provider_subscription_id: providerSubscriptionId,
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
    // Eveniment de tip necunoscut/irelevant - ignorăm fără eroare.
    return { status: 200, body: { success: true, skipped: true } };
  }

  const productId = event.product_id ?? '';
  if (!ACCEPTED_PRODUCT_SET.has(productId)) {
    // Produs necunoscut - nu acordă Premium.
    return { status: 200, body: { success: true, skipped: true } };
  }

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

  const { error } = await deps.admin.rpc('sync_revenuecat_subscription', {
    p_user_id: appUserId,
    p_status: snapshot.status,
    p_plan: snapshot.plan,
    p_product_id: snapshot.product_id,
    p_provider_subscription_id: snapshot.provider_subscription_id,
    p_current_period_end: snapshot.current_period_end,
    p_cancel_at_period_end: snapshot.cancel_at_period_end,
    p_snapshot_at_ms: snapshot.snapshot_at_ms,
  });

  if (error) {
    // Nu logăm detalii personale; doar un mesaj generic.
    return { status: 500, body: { error: 'Actualizarea nu a reusit.' } };
  }

  return { status: 200, body: { success: true } };
}

