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
 *  - Evenimentele sunt idempotente (upsert keyed pe `user_id`).
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

export type WebhookDeps = {
  webhookAuthToken: string | null;
  admin: {
    from: (table: string) => {
      upsert: (
        row: Record<string, unknown>,
        opts?: { onConflict?: string },
      ) => Promise<{ error: unknown | null }>;
    };
  };
};

export type WebhookResult = { status: number; body: Record<string, unknown> };

/**
 * Gestionează o cerere webhook. Returnează un rezultat `{ status, body }`
 * care poate fi convertit într-un `Response` de către apelant (Deno/Edge).
 * Nu trimite cereri către RevenueCat și nu citește/modifică baza decât prin
 * `deps.admin` (injectat), deci poate fi testat local cu un admin mock.
 */
export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<WebhookResult> {
  if (req.method !== 'POST') {
    return { status: 405, body: { error: 'Metoda neacceptata.' } };
  }

  if (!deps.webhookAuthToken) {
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

  const update = resolveSubscriptionUpdate(event.type ?? '', productId, event);
  if (!update) {
    return { status: 200, body: { success: true, skipped: true } };
  }

  const row = buildUpsertRow(appUserId, update);
  const { error } = await deps.admin
    .from('subscriptions')
    .upsert(row, { onConflict: 'user_id' });

  if (error) {
    // Nu logăm detalii personale; doar un mesaj generic.
    return { status: 500, body: { error: 'Actualizarea nu a reusit.' } };
  }

  return { status: 200, body: { success: true } };
}

