/**
 * Nucleul funcției `revenuecat-sync-user` (T3, 10.10.2026).
 *
 * DE CE EXISTĂ
 * ---------------
 * Accesul Premium se taie în baza de date (`reserve_ai_request` citește `public.subscriptions`:
 * 50/zi cu rând activ, 5/zi fără), dar ecranul citește entitlement-ul RevenueCat. Când cele două surse
 * nu se întâlnesc, omul vede „Premium activ” și primește 5 mesaje pe zi. Webhook-ul repară asta,
 * dar numai când RevenueCat trimite un eveniment; o achiziție făcută înainte de deploy, un eveniment
 * pierdut sau un receipt restaurat pe alt dispozitiv lasă rândul în urmă pentru totdeauna.
 * Funcția aceasta închide golul: aplicația cere, o singură dată, reconcilierea rândului din chiar
 * starea pe care o vede SDK-ul.
 *
 * REGULI DE SIGURANȚĂ (nu se slăbesc)
 * -------------------------------------
 *   1. Identitatea vine EXCLUSIV din tokenul verificat (`Authorization: Bearer <jwt>`), niciodată din
 *      corpul cererii. Corpul nu este citit deloc — nu există un `user_id` pe care clientul să-l impună.
 *   2. Cheia RevenueCat stă doar pe server (`Deno.env`), nu ajunge în răspuns sau în log.
 *   3. Scrierea se face doar prin RPC-ul `sync_revenuecat_subscription` (service role, `security definer`,
 *      `search_path` fixat), adică prin exact aceeași poartă ca webhook-ul.
 *   4. Fail closed: dacă RevenueCat nu confirmă un abonament activ pentru acest utilizator, NU se scrie
 *      nimic — un rând bun nu este coborât la `expired` pe baza unei identități care nu se potrivește.
 *   5. Răspuns fără date personale; jurnalul conține doar `user_id` + codul.
 *
 * CODURI DE RĂSPUNS (aceleași ca la webhook, plus 409 pentru „nimic de scris”)
 *   204 — rândul a fost scris;  502 — apelul RevenueCat a eșuat;  500 — scrierea a eșuat;
 *   401 — fără token valid;  405 — altă metodă;  503 — lipsesc secrete;  409 — nimic de scris
 *   (`no_premium_subscription` / `stale_snapshot`), caz în care clientul re-citește rândul și atât.
 */
import {
  isValidUUID,
  resolveCustomerSnapshot,
  type RevenueCatCustomerInfo,
  type RevenueCatSubscriptionInfo,
} from '../revenuecat-webhook/core.ts';

export type SyncUserDeps = {
  revenueCatApiKey: string | null;
  /** Verifică tokenul de sesiune (GoTrue) și întoarce utilizatorul, sau `null`. */
  getUser: (accessToken: string) => Promise<{ id?: string | null } | null>;
  fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  admin: {
    rpc: (
      fn: string,
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown | null }>;
  };
  logger?: { warn: (...args: unknown[]) => void };
};

export type SyncUserResult = {
  status: number;
  /** `null` însemnaă răspuns fără corp (204). */
  body: Record<string, unknown> | null;
};

/** Tokenul din `Authorization: Bearer <token>`; fără header nu există identitate. */
export function bearerToken(authHeader: string | null): string {
  if (typeof authHeader !== 'string') return '';
  const prefix = 'Bearer ';
  if (!authHeader.startsWith(prefix)) return '';
  return authHeader.slice(prefix.length).trim();
}

/**
 * Mediul achiziției derivat din Customer Info v1.
 *
 * Payload-ul v1 nu are un câmp `environment` (doar evenimentul de webhook îl are); singurul semnal
 * este `is_sandbox` pe intrarea de abonament. `undefined` înseamnă „nu ȘTIU”, nu „production”:
 * se trimite `null`, iar coloana rămâne necompletată în loc să primească o proveniență inventată.
 */
export function environmentFor(
  subscription: RevenueCatSubscriptionInfo | undefined,
): 'sandbox' | 'production' | null {
  if (subscription?.is_sandbox === true) return 'sandbox';
  if (subscription?.is_sandbox === false) return 'production';
  return null;
}

/**
 * Gestionează o cerere de sincronizare. Nu are nevoie de stare la nivel de modul și nu citește corpul
 * cererii, deci poate fi testată local cu un `getUser`, un `fetcher` și un `admin` simulate.
 */
export async function handleSyncUser(req: Request, deps: SyncUserDeps): Promise<SyncUserResult> {
  if (req.method !== 'POST') {
    return { status: 405, body: { error: 'Metoda neacceptata.' } };
  }

  if (!deps.revenueCatApiKey) {
    return { status: 503, body: { error: 'Serviciul nu este configurat.' } };
  }

  const token = bearerToken(req.headers.get('Authorization'));
  if (!token) {
    return { status: 401, body: { error: 'Acces neautorizat.' } };
  }

  let user: { id?: string | null } | null = null;
  try {
    user = await deps.getUser(token);
  } catch {
    user = null;
  }

  const userId = typeof user?.id === 'string' && isValidUUID(user.id) ? user.id : '';
  if (!userId) {
    return { status: 401, body: { error: 'Acces neautorizat.' } };
  }

  // Corpul cererii NU se citește: identitatea e doar cea din tokenul verificat mai sus.

  let response: Response;
  try {
    response = await deps.fetcher(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
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

  // Fără `subscriber` în răspuns, RevenueCat nu a întors un abonat — nu avem ce sincroniza.
  // Fara `subscriber` sau fara ora instantaneului, RevenueCat nu a intors un abonat citibil.
  if (
    !customerInfo ||
    typeof customerInfo !== 'object' ||
    !customerInfo.subscriber ||
    typeof customerInfo.request_date_ms !== 'number'
  ) {
    return { status: 502, body: { error: 'Raspuns RevenueCat invalid.' } };
  }

  // Fallback-ul e gol: produsul se ia din entitlement (`product_identifier`), exact ca în webhook.
  const snapshot = resolveCustomerSnapshot(customerInfo, '');
  if (!snapshot) {
    // RevenueCat a răspuns, dar nu există niciun abonament `premium` pentru acest utilizator.
    return { status: 409, body: { synced: false, reason: 'no_premium_subscription' } };
  }

  if (snapshot.status === 'expired') {
    // Nu coborâm un rând existent pe baza unei citiri care spune „inactiv”: dacă magazinul vede
    // abonamentul, dar interogarea server-side nu, întâi se rezolvă identitatea, nu se scrie baza.
    return { status: 409, body: { synced: false, reason: 'not_active_server_side' } };
  }

  const subscription = customerInfo.subscriber.subscriptions?.[snapshot.product_id];
  const environment = environmentFor(subscription);

  const { data, error } = await deps.admin.rpc('sync_revenuecat_subscription', {
    p_user_id: userId,
    p_status: snapshot.status,
    p_plan: snapshot.plan,
    p_product_id: snapshot.product_id,
    p_provider_subscription_id: snapshot.provider_subscription_id,
    p_current_period_end: snapshot.current_period_end,
    p_cancel_at_period_end: snapshot.cancel_at_period_end,
    p_snapshot_at_ms: snapshot.snapshot_at_ms,
    p_provider: snapshot.provider,
    p_environment: environment,
  });

  if (error) {
    return { status: 500, body: { error: 'Actualizarea nu a reusit.' } };
  }

  if (data === false) {
    // RPC-ul refuză să suprascrie un rând cu un instantaneu mai vechi.
    return { status: 409, body: { synced: false, reason: 'stale_snapshot' } };
  }

  return { status: 204, body: null };
}
