import type { TranslationKey } from '@/i18n/config';

export const FREE_DAILY_AI_LIMIT = 5;
export const PREMIUM_DAILY_AI_LIMIT = 50;

export type SubscriptionRow = {
  status: string;
  plan: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export function hasPremiumAccess(subscription: SubscriptionRow | null | undefined) {
  if (!subscription) return false;
  // 'canceled' păstrează accesul până la sfârșitul perioadei plătite.
  if (!['active', 'trialing', 'canceled'].includes(subscription.status)) return false;
  // E-09: fail closed. A NULL current_period_end used to return true, so a row
  // written without a verifiable expiry granted Premium forever. An entitlement
  // whose end date cannot be read is not a verifiable entitlement.
  if (!subscription.current_period_end) return false;
  const periodEnd = new Date(subscription.current_period_end).getTime();
  if (Number.isNaN(periodEnd)) return false;
  return periodEnd > Date.now();
}

export function subscriptionPlanLabel(subscription: SubscriptionRow | null | undefined): TranslationKey {
  if (!hasPremiumAccess(subscription)) return 'premium.planFree';
  return subscription?.plan === 'annual' ? 'premium.statusAnnual' : 'premium.statusMonthly';
}

/**
 * Starea ecranului Premium (poziția B1 din audit).
 *
 * `hasPremiumAccess` citește exclusiv rândul din `subscriptions`, iar rândul acela este scris de
 * webhook-ul RevenueCat — clientul nu are voie să-l scrie (RLS, vezi
 * `20260902000100_harden_subscriptions_rls.sql`). Dacă webhook-ul întârzie sau e oprit, utilizatorul
 * a plătit, SDK-ul magazinului îi vede abonamentul, dar aplicația îi arăta „Plan Gratuit" și îi
 * oferea din nou butoanele de cumpărare. Cele trei stări de mai jos fac diferența explicită:
 *
 *   'active'            — rândul din baza de date confirmă abonamentul;
 *   'activation-pending' — magazinul confirmă abonamentul (`storeEntitled`), rândul nu a ajuns încă
 *                          (webhook întârziat/oprit): plata a fost primită, deci NU se mai cumpără;
 *   'free'              — nici baza de date, nici magazinul nu confirmă un abonament.
 */
export type PremiumScreenState = 'free' | 'active' | 'activation-pending';

export function premiumScreenState(
  subscription: SubscriptionRow | null | undefined,
  storeEntitled: boolean | null | undefined,
): PremiumScreenState {
  if (hasPremiumAccess(subscription)) return 'active';
  if (storeEntitled === true) return 'activation-pending';
  return 'free';
}

/**
 * Butoanele de cumpărare se ascund cât timp magazinul confirmă deja un abonament: altfel plătitorul
 * este împins să cumpere a doua oară exact în fereastra în care așteaptă activarea.
 */
export function shouldShowPurchaseButtons(state: PremiumScreenState): boolean {
  return state === 'free';
}

/**
 * Re-verificarea stării cât timp magazinul confirmă abonamentul, dar rândul din baza de date nu a
 * apărut încă. `useSubscription` re-citește o singură dată, la 1,5 s după ce se schimbă starea din
 * RevenueCat (`use-subscription.ts:69-80`); dacă webhook-ul scrie mai târziu, ecranul rămânea blocat
 * pe „plan gratuit" până la repornirea aplicației. Aici re-verificarea e repetată, dar MĂRGINITĂ:
 * după ~1 minut ne oprim și rămâne mesajul vizibil cu adresa de suport (nu ținem un ecran care
 * interoghează la nesfârșit baza de date).
 */
export const PENDING_ACTIVATION_POLL_INTERVAL_MS = 5_000;
export const PENDING_ACTIVATION_POLL_MAX_ATTEMPTS = 12;

export function shouldPollPendingActivation(state: PremiumScreenState, attempt: number): boolean {
  return state === 'activation-pending' && attempt < PENDING_ACTIVATION_POLL_MAX_ATTEMPTS;
}

