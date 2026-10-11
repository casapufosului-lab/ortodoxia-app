/**
 * T3 (10.10.2026) — cererea de reconciliere către `revenuecat-sync-user`.
 *
 * Accesul Premium se taie în baza de date, dar ecranul citește entitlement-ul RevenueCat: când cele
 * două surse nu se întâlnesc, omul vede „Premium activ” și primește 5 mesaje pe zi. Aici se cere,
 * o singură dată și rar, ca serverul să scrie rândul din chiar starea pe care o vede magazinul.
 *
 * Ce NU face acest modul: nu decide accesul (o face `premiumActive` din `use-revenuecat.ts`), nu citește
 * baza (o face `use-subscription.ts`) și nu trimite niciun identificator — identitatea este tokenul
 * sesiunii, pus de `functions.invoke` în `Authorization`, iar funcția acceptă doar atât.
 */
import { PREMIUM_SYNC_FUNCTION, PREMIUM_SYNC_THROTTLE_MS, throttleAllowsRequest } from '@/lib/premium-sync-policy';
import { hasPremiumAccess, type SubscriptionRow } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';

export { PREMIUM_SYNC_FUNCTION, PREMIUM_SYNC_THROTTLE_MS, throttleAllowsRequest };

/**
 * Condiția de chemare: magazinul confirmă abonamentul, dar rândul din bază nu îl confirmă (lipsește,
 * e expirat sau are alt statut). Se folosește `hasPremiumAccess`, adică EXACT regula după care se taie
 * accesul în aplicație, ca să nu existe două definiții ale „rândului bun”.
 */
export function needsServerSync(
  premiumActive: boolean,
  row: SubscriptionRow | null | undefined,
): boolean {
  if (!premiumActive) return false;
  return !hasPremiumAccess(row);
}

export type PremiumSyncOutcome = { ok: boolean; status: number };

function statusOfError(error: unknown): number {
  const status = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return typeof status === 'number' ? status : 0;
}

/**
 * O SINGURĂ chemare, fără corp. `204` înseamnă că rândul a fost scris (apelantul re-citește rândul);
 * `409` înseamnă că nu era nimic de scris; `401` că nu există sesiune; `502`/`500` că serverul nu a putut.
 * Rezultatul este raportat, nu aruncat: ecranul nu are voie să se spargă pentru o reconciliere.
 */
export async function requestPremiumSync(): Promise<PremiumSyncOutcome> {
  try {
    const { error } = await supabase.functions.invoke(PREMIUM_SYNC_FUNCTION, { method: 'POST' });
    if (!error) return { ok: true, status: 204 };
    return { ok: false, status: statusOfError(error) };
  } catch {
    return { ok: false, status: 0 };
  }
}
