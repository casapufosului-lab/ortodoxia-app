/**
 * T3 (10.10.2026) — politici pure pentru reconcilierea Premium (fără importuri, deci testabile direct).
 *
 * De ce un fișier separat: `src/lib/premium-sync.ts` are nevoie de clientul Supabase (care la rândul lui
 * cere variabile de mediu și module React Native), deci nu poate fi importat într-un test Node. Regulile
 * care pot greși — fereastra de rărire — stau aici, într-o formă pură, și sunt rulate de teste.
 */

/**
 * Cel mult O chemare a funcției de sincronizare la 10 minute, per instalare.
 *
 * Motivul: chemarea este o reconciliere cerută de client, nu un poll. Fără această fereastră, o re-citire
 * a rândului care încă nu confirmă ar declanșa imediat o nouă chemare („buclă”), iar fiecare chemare
 * consumă un apel RevenueCat și o scriere în bază.
 */
export const PREMIUM_SYNC_THROTTLE_MS = 10 * 60 * 1000;

/** Numele funcției Edge; folosit și de teste, ca să nu existe două adevăruri. */
export const PREMIUM_SYNC_FUNCTION = 'revenuecat-sync-user';

/**
 * `true` dacă a trecut fereastra de răcire de la ultima cerere.
 *
 * `lastRequestAt <= 0` (niciodată chemată) permite prima cerere. `now` este injectat, ca testul să nu
 * depindă de ceas.
 */
export function throttleAllowsRequest(
  lastRequestAt: number,
  now: number,
  windowMs: number = PREMIUM_SYNC_THROTTLE_MS,
): boolean {
  if (!Number.isFinite(lastRequestAt) || lastRequestAt <= 0) return true;
  if (!Number.isFinite(now) || now < lastRequestAt) return false;
  return now - lastRequestAt >= windowMs;
}
