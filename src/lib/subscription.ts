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
 * Ce poate vinde magazinul pentru un plan (OBIECTIV 1 din task-ul de paywall).
 *
 * De ce e nevoie de stările astea: ecranul Premium afișa prețurile din catalogul RevenueCat și ținea
 * butonul activ chiar și atunci când magazinul nu avea ce vinde. Măsurat pe 08.10.2026: pe un build
 * instalat cu `adb`, Google Play răspundea „The item you were attempting to purchase could not be
 * found." — adică omul apăsa un buton care nu putea duce nicăieri. Prețul afișat atunci venea din
 * catalogul RevenueCat, nu din produsul magazinului, deci nu era dovada că se poate cumpăra.
 *
 * Regula: butonul se activează **doar** pentru `purchasable`. `checking` (încă nu știm) și toate
 * stările de mai jos înseamnă buton dezactivat, fiecare cu mesajul ei, ca omul să știe *de ce*.
 *
 *   'checking'           — nu am citit încă ofertele magazinului; nu promitem nimic;
 *   'store-unavailable'  — SDK-ul magazinului nu e configurat (cheie lipsă/placeholder);
 *   'device-cannot-pay'  — magazinul e configurat, dar dispozitivul nu poate cumpăra;
 *   'offerings-error'    — citirea ofertelor a eșuat (rețea);
 *   'no-offerings'       — magazinul nu a întors nicio ofertă;
 *   'no-package'         — există oferte, dar niciuna pentru planul cerut;
 *   'no-price'           — pachetul există, dar magazinul nu i-a dat preț;
 *   'purchasable'        — pachet + preț de la magazin: singura stare în care se poate cumpăra.
 */
export type PurchaseAvailability =
  | 'checking'
  | 'store-unavailable'
  | 'device-cannot-pay'
  | 'offerings-error'
  | 'no-offerings'
  | 'no-package'
  | 'no-price'
  | 'purchasable';

/** Starea citirii ofertelor: `loading` e „nu știm încă", nu „nu există". */
export type StoreOfferingsLoad = 'loading' | 'loaded' | 'error';

export function purchaseAvailability(input: {
  storeConfigured: boolean;
  /** `null` = încă necunoscut. Doar un `false` explicit blochează: un eșec de citire nu are voie să
   *  ascundă un buton care ar funcționa (aceeași regulă ca la butoanele de autentificare). */
  canMakePayments: boolean | null;
  offeringsLoad: StoreOfferingsLoad;
  packageCount: number;
  hasPackageForPlan: boolean;
  /** Prețul primit de la magazin (`priceString`). Fără el nu afișăm preț și nu activăm butonul. */
  storePrice: string | null;
}): PurchaseAvailability {
  if (!input.storeConfigured) return 'store-unavailable';
  if (input.canMakePayments === false) return 'device-cannot-pay';
  if (input.offeringsLoad === 'loading') return 'checking';
  if (input.offeringsLoad === 'error') return 'offerings-error';
  if (input.packageCount <= 0) return 'no-offerings';
  if (!input.hasPackageForPlan) return 'no-package';
  if (!input.storePrice || input.storePrice.trim().length === 0) return 'no-price';
  return 'purchasable';
}

/** Singura stare în care butonul de cumpărare are voie să fie activ. */
export function isPurchasable(availability: PurchaseAvailability): boolean {
  return availability === 'purchasable';
}

/**
 * Mesajul care însoțește butonul dezactivat. `null` pentru stările care nu au nevoie de text:
 * `purchasable` (se poate cumpăra) și `checking` (stare trecătoare, fără vină).
 */
export function purchaseAvailabilityMessageKey(
  availability: PurchaseAvailability,
): TranslationKey | null {
  switch (availability) {
    case 'store-unavailable':
      return 'premium.storeUnavailable';
    case 'device-cannot-pay':
      return 'premium.deviceCannotPurchase';
    case 'offerings-error':
      return 'premium.offeringsError';
    case 'no-offerings':
      return 'premium.storeNoOfferings';
    case 'no-package':
      return 'premium.planUnavailable';
    case 'no-price':
      return 'premium.priceUnavailable';
    default:
      return null;
  }
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

