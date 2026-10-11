import type { TranslationKey } from '@/i18n/config';

export const FREE_DAILY_AI_LIMIT = 5;
export const PREMIUM_DAILY_AI_LIMIT = 50;
/**
 * Cat timp are voie starea „magazinul nu a raspuns inca” sa tina butoanele de cumparare ascunse
 * (T4, 10.10.2026). Dupa atat, fereastra „necunoscut” se inchide si ecranul Premium trece pe „inactiv”,
 * cu butoanele VIZIBILE: un om care poate cumpara nu are voie sa ramana fara niciun buton pentru ca o
 * citire `CustomerInfo` nu s-a terminat niciodata.
 */
export const STORE_STATE_UNKNOWN_TIMEOUT_MS = 10_000;

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
 * Butoanele de cumparare se ascund DOAR cand magazinul confirma deja un abonament activ: altfel
 * plătitorul este împins să cumpere a doua oară exact în fereastra în care așteaptă activarea.
 *
 * T4 (10.10.2026) — regula, formulată explicit: butoanele sunt VIZIBILE pentru orice utilizator
 * NECONFIRMAT de magazin (`'free'`), inclusiv după ce fereastra „necunoscut” s-a închis (vezi
 * `premiumUiState` și `STORE_STATE_UNKNOWN_TIMEOUT_MS`). „Necunoscut” nu este o a treia stare
 * ascunsă: este doar `'free'` amanat puțin, iar după expirare (sau după o citire eșuată)
 * butoanele apar.
 */
export function shouldShowPurchaseButtons(state: PremiumScreenState): boolean {
  return state === 'free';
}

/**
 * Starea Premium AFISATA, derivata dintr-o SINGURA valoare (build 18, 10.10.2026) + regula „fara
 * butoane ascunse” (T4, 10.10.2026).
 *
 * De ce exista: pe build 16 ownerul a vazut „Plan Gratuit” SI butoanele de cumparare disparute —
 * eticheta planului venea din randul din `subscriptions`, iar butoanele din entitlement-ul
 * RevenueCat. Doua expresii diferite, deci doua raspunsuri diferite pe acelasi ecran. Aici amandoua
 * ies din ACELASI `premiumActive`, care la randul lui vine dintr-un singur loc
 * (`customerInfo.entitlements.active['premium']`, calculat o data in `use-revenuecat.ts`):
 *
 *   `premiumActive` true  -> „Premium activ” + data de expirare + butoane ASCUNSE;
 *   `premiumActive` false -> „Plan Gratuit” + butoane VIZIBILE.
 *
 * `storeStateKnown` (fail-closed): cand magazinul e configurat, dar nicio citire de `CustomerInfo`
 * nu a reusit inca, starea este NECUNOSCUTA, nu „fara abonament” — un om care poate fi deja abonat
 * nu are voie sa fie impins sa cumpere a doua oara (pozitia B1 din audit).
 *
 * T4 (10.10.2026) — dar „necunoscut” nu are voie sa fie vesnic: fereastra se inchide cand citirea a
 * eșuat explicit (`storeStateUnknownError`) sau cand au trecut `STORE_STATE_UNKNOWN_TIMEOUT_MS`
 * (`storeStateUnknownExpired`). Din acel moment starea afisata este „inactiv” (eticheta „Plan Gratuit”,
 * corecta: chiar nu avem nicio dovada de abonament), iar butoanele se ARATA — fara login, butonul
 * cere autentificare, nu cumpara. Marcajul intern pentru fereastra deschisa ramane
 * `'activation-pending'`, dar el NU ajunge niciodata pe ecran ca text de plan: eticheta de acolo este
 * mereu una dintre cele doua de mai sus.
 */
export type PremiumUiState = {
  /** Cheia textului afisat ca „planul tau". */
  labelKey: TranslationKey;
  /** Data de expirare care se afiseaza (ISO) sau `null` cand nu exista abonament activ. */
  expirationDate: string | null;
  /** Butoanele de cumparare se afiseaza? */
  showPurchaseButtons: boolean;
};

/**
 * Rezumatul abonamentului pentru cardul „Abonament" din ecranul Cont (bug raportat de owner pe
 * build 18, 10.10.2026).
 *
 * De ce exista: ecranul Premium scria „Premium activ — abonamentul este confirmat de magazin.", iar
 * cardul din Cont scria „Plan Gratuit" + „Ai 5 mesaje AI pe zi" — pe ACELASI telefon, in aceeasi
 * secunda. Cauza: doua surse de adevar. Contul citea `useSubscription().isPremium`, adica randul din
 * tabelul `subscriptions`, iar randul acela este scris de webhook-ul RevenueCat (intarziere de
 * secunde, sau webhook oprit ⇒ ramane „Plan Gratuit" la nesfarsit); ecranul Premium citea
 * entitlement-ul „premium" din `CustomerInfo` (`entitlements.active['premium'].isActive`).
 *
 * Aici intra DOAR acea valoare unica (`premiumActive`, calculata o singura data in
 * `use-revenuecat.ts`): eticheta planului, limita AI si butonul ies toate din ea, deci cardul din
 * Cont nu mai poate contrazice ecranul Premium. Numele planului (lunar/anual) se citeste tot din
 * entitlement (`entitlement.plan`), nu din randul din baza de date.
 */
export type PlanSummary = {
  /** Eticheta planului: „Premium Lunar"/„Premium Anual" sau „Plan Gratuit". */
  labelKey: TranslationKey;
  /** Textul despre limita AI (cheia careia i se aplica `{count}`, cand `bodyCount` nu e `null`). */
  bodyKey: TranslationKey;
  /** Numarul de mesaje AI pe zi, sau `null` cand textul nu are `{count}`. */
  bodyCount: number | null;
  /** Butonul secundar: „Vezi abonamentul" (abonat) sau „Vezi Premium" (neabonat). */
  buttonKey: TranslationKey;
};

export function planSummary(input: {
  /** `entitlements.active['premium'].isActive` — singura sursa de adevar. */
  premiumActive: boolean;
  /** `entitlement.plan` („annual"/„monthly"), tot din acelasi entitlement. */
  entitlementPlan?: string | null;
}): PlanSummary {
  if (input.premiumActive !== true) {
    return {
      labelKey: 'premium.planFree',
      bodyKey: 'account.freeMessagesPerDay',
      bodyCount: null,
      buttonKey: 'account.viewPremiumButton',
    };
  }

  return {
    // Aceeasi expresie ca in `src/app/premium.tsx` (numele planului, din acelasi entitlement).
    labelKey: input.entitlementPlan === 'annual' ? 'premium.statusAnnual' : 'premium.statusMonthly',
    bodyKey: 'account.aiMessagesPerDay',
    bodyCount: PREMIUM_DAILY_AI_LIMIT,
    buttonKey: 'account.viewSubscriptionButton',
  };
}

export function premiumUiState(input: {
  /** `entitlements.active['premium'].isActive` — singura sursa de adevar. */
  premiumActive: boolean;
  premiumExpirationDate: string | null | undefined;
  storeStateKnown: boolean;
  /**
   * T4 (10.10.2026): citirea `CustomerInfo` a eșuat explicit — fereastra „necunoscut” se inchide.
   * Optional, ca apelantii care nu au informatia sa nu fie obligati sa o inventeze.
   */
  storeStateUnknownError?: boolean;
  /** T4 (10.10.2026): au trecut `STORE_STATE_UNKNOWN_TIMEOUT_MS` fără nicio citire reușită. */
  storeStateUnknownExpired?: boolean;
}): PremiumUiState {
  if (input.premiumActive === true) {
    // Entitlement activ: „Premium activ" + expirare, FARA butoane de cumparare.
    return {
      labelKey: 'premium.entitlementActive',
      expirationDate: input.premiumExpirationDate ?? null,
      showPurchaseButtons: false,
    };
  }

  const windowClosed = input.storeStateUnknownError === true || input.storeStateUnknownExpired === true;
  // Fereastra „necunoscut" tine butoanele ascunse DOAR cat timp nu s-a terminat prima determinare.
  const unknown = input.storeStateKnown === false && !windowClosed;
  // Marcajul intern al ferestrei deschise: `'activation-pending'` (folosit si de `premiumScreenState`
  // pentru mesajul „activarea e in curs"). Nu ajunge niciodata ca eticheta de plan: mai jos, eticheta
  // este „Plan Gratuit" oricum, pentru ca nu avem nicio dovada de abonament.
  const storeState: PremiumScreenState = unknown ? 'activation-pending' : 'free';
  return {
    labelKey: 'premium.planFree',
    expirationDate: null,
    showPurchaseButtons: shouldShowPurchaseButtons(storeState),
  };
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

