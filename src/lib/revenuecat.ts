import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

/**
 * Cheia publică de pe platformă (App specific key) din panoul RevenueCat.
 * Pentru hibride (React Native) există câte o cheie publică separată pentru
 * iOS și Android, configurată în `Project Settings > API keys`.
 */
const APPLE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY;
const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY;

/** Identificatorul entitelment-ului Premium definit în panoul RevenueCat. */
export const PREMIUM_ENTITLEMENT_ID = 'premium';

/**
 * Tipul abonamentului derivat din pachetul ales. Folosim identificatorii
 * pachetelor 'monthly' și 'annual' definiți în Offering-ul "Premium".
 */
export type RevenueCatPlan = 'monthly' | 'annual';


let configured = false;
let revenueCatOperationTail: Promise<void> = Promise.resolve();

async function runRevenueCatExclusive<T>(operation: () => Promise<T>): Promise<T> {
  const previousOperation = revenueCatOperationTail;
  let release!: () => void;
  revenueCatOperationTail = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previousOperation;
  try {
    return await operation();
  } finally {
    release();
  }
}

/**
 * Configurează SDK-ul RevenueCat o singură dată, la pornirea aplicației.
 * Nu este un pas nativ obligatoriu (configurarea se face în JavaScript), dar
 * necesită un development build pentru a funcționa cumpărarea reală.
 */
export function configureRevenueCat() {
  if (configured) return;
  if (Platform.OS === 'web') return;

  const apiKey = Platform.OS === 'ios' ? APPLE_API_KEY : GOOGLE_API_KEY;
  if (!apiKey || isPlaceholderRevenueCatKey(apiKey)) {
    // Fără cheie configurată, SDK-ul nu se poate inițializa; logăm doar în dev.
    if (__DEV__) {
      console.warn('RevenueCat: lipsește cheia publică în .env sau este un placeholder.');
    }
    return;
  }

  // Debug logging must never be enabled in a release build: RevenueCat's DEBUG
  // output includes the app user id and purchase details, which then sit in the
  // device log and contradict the privacy policy.
  //
  // Poziția B10 din audit: `configureRevenueCat()` nu are voie să arunce niciodată.
  // `setLogLevel()` și `configure()` sunt apeluri care ajung în SDK-ul nativ: pot arunca
  // sincron (cheie respinsă, BillingClient neinițializat, SDK configurat deja de altă
  // componentă). Un throw de aici urca în `src/app/_layout.tsx`, adică exact în calea de
  // pornire, și oprea aplicația — simptomul „aplicația se închide" pe care l-am văzut cu o
  // cheie de Test Store. Prins aici, aplicația pornește și rămâne în starea cunoscută
  // „magazin indisponibil" (`isRevenueCatConfigured()` = false), pe care o afișează deja
  // ecranul Premium.
  if (__DEV__) {
    try {
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);
    } catch {
      // Doar logging: un eșec aici nu are voie să împiedice configurarea magazinului.
    }
  }

  try {
    Purchases.configure({ apiKey });
    configured = true;
  } catch (error) {
    configured = false;
    if (__DEV__) {
      console.warn('RevenueCat: configurarea SDK-ului a eșuat; magazinul rămâne indisponibil.', error);
    }
  }
}

/**
 * True when a configured key is a placeholder rather than a real RevenueCat key.
 *
 * `.env.example` ships values like `your_apple_api_key_here`. Those are non-empty,
 * so a naive truthiness check treats them as configured and the SDK fails later
 * with an opaque store error instead of the honest "store unavailable" path.
 */
export function isPlaceholderRevenueCatKey(apiKey: string | undefined | null): boolean {
  const trimmed = (apiKey ?? '').trim();
  // O valoare lipsă, goală sau doar spații nu poate configura SDK-ul.
  if (trimmed.length === 0) return true;
  // Placeholder values shipped by `.env.example`.
  if (/^(your_|REPLACE|CHANGEME|xxx)/i.test(trimmed)) return true;
  // A RevenueCat *Test Store* key (`test_…`, `test-…`, `teststore…`) is not a sale
  // key. Handed to `Purchases.configure()` in a release build, the native SDK shows
  // "Wrong API Key … you are using a test API key … The app will close now" and kills
  // the process, so the whole app died at startup. Treating it as "no key" makes the
  // app start and show the honest "store unavailable" state instead.
  if (/^(test[._-]|teststore)/i.test(trimmed)) return true;
  return false;
}

export function isRevenueCatConfigured() {
  return configured && typeof Purchases.isConfigured === 'boolean'
    ? Purchases.isConfigured
    : configured;
}

/**
 * Leagă utilizatorul autentificat (din Supabase) de un App User ID în
 * RevenueCat, astfel încât abonamentul să fie urmărit pe același utilizator
 * pe toate dispozitivele.
 */
export async function identifyRevenueCatUser(userId: string) {
  if (!isRevenueCatConfigured()) return;
  await runRevenueCatExclusive(() => ensureRevenueCatUserUnlocked(userId));
}

async function ensureRevenueCatUserUnlocked(userId: string) {
  if (!isRevenueCatConfigured()) throw new Error('RevenueCat is not configured.');
  const currentUserId = await Purchases.getAppUserID();
  if (currentUserId !== userId) await Purchases.logIn(userId);
  const verifiedUserId = await Purchases.getAppUserID();
  if (verifiedUserId !== userId) throw new Error('RevenueCat user identity mismatch.');
}

export async function ensureRevenueCatUser(userId: string) {
  return runRevenueCatExclusive(() => ensureRevenueCatUserUnlocked(userId));
}

export async function getRevenueCatCustomerInfo(userId: string): Promise<CustomerInfo> {
  return runRevenueCatExclusive(async () => {
    await ensureRevenueCatUserUnlocked(userId);
    return Purchases.getCustomerInfo();
  });
}

/** Deconectează utilizatorul de la RevenueCat (apelat la sign-out). */
export async function clearRevenueCatUser(userId: string) {
  if (!isRevenueCatConfigured()) return;
  await runRevenueCatExclusive(async () => {
    const currentUserId = await Purchases.getAppUserID();
    if (currentUserId !== userId) return;
    await Purchases.logOut();
  });
}

/**
 * Caută pachetele disponibile în Offering-ul curent. În panoul RevenueCat,
 * Offering-ul "Premium" conține pachetele 'monthly' și 'annual'.
 */
export async function getRevenueCatOfferings(): Promise<PurchasesPackage[] | null> {
  if (!isRevenueCatConfigured()) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? null;
}

/**
 * Find the package for a plan.
 *
 * RevenueCat's dashboard assigns default identifiers (`$rc_monthly`, `$rc_annual`)
 * unless an operator renames them, and the setup checklist asks for `monthly` /
 * `annual`. Matching only the custom names meant that on a default-configured project
 * `packageForPlan` returned null and **both** buy buttons answered "plan unavailable"
 * — nobody could subscribe, with no indication of why.
 *
 * Resolution order:
 *   1. the exact custom identifier the project's setup documents;
 *   2. RevenueCat's standard package type for the same period;
 *   3. the product's own billing period, for a package whose identifier is arbitrary.
 * Matching is case-insensitive so `Monthly` behaves like `monthly`.
 */
export function packageForPlan(
  packages: PurchasesPackage[],
  plan: RevenueCatPlan,
): PurchasesPackage | null {
  const wantedIdentifier = plan === 'annual' ? 'annual' : 'monthly';
  // `PACKAGE_TYPE` is exposed as a static on the SDK class, not as a named export.
  const standardType = plan === 'annual'
    ? Purchases.PACKAGE_TYPE.ANNUAL
    : Purchases.PACKAGE_TYPE.MONTHLY;

  // 1. Exact custom identifier.
  const byIdentifier = packages.find(
    (pkg) => pkg.identifier?.toLowerCase() === wantedIdentifier,
  );
  if (byIdentifier) return byIdentifier;

  // 2. RevenueCat standard package type.
  const byPackageType = packages.find((pkg) => pkg.packageType === standardType);
  if (byPackageType) return byPackageType;

  // 3. Fall back to the underlying product's billing period.
  const byProduct = packages.find((pkg) => {
    const period = pkg.product?.subscriptionPeriod;
    if (!period) return false;
    return plan === 'annual' ? /^P1Y|^P12M/.test(period) : /^P1M|^P1W/.test(period);
  });
  return byProduct ?? null;
}

/**
 * Generează textul de preț pentru un pachet, folosind datele din magazin
 * (produsul de bază): `priceString`, adică prețul localizat, cu simbolul monedei.
 *
 * OBIECTIV 1 (paywall): NU ne mai întoarcem la `product.price`, un număr fără monedă. Un preț
 * afișat fără monedă este un preț pe care omul nu-l poate verifica în magazin, iar ecranul Premium
 * îl folosea ca dovadă că se poate cumpăra. Fără `priceString` întoarcem `null`, iar ecranul
 * dezactivează butonul (`no-price`) în loc să inventeze un preț.
 */
export function packagePriceText(pkg: PurchasesPackage): string | null {
  const priceString = pkg.product?.priceString?.trim();
  return priceString ? priceString : null;
}

/**
 * Efectuează cumpărarea unui pachet. Returnează CustomerInfo actualizat.
 * Aruncă o eroare dacă utilizatorul a anulat, cu codul specific.
 */
export async function purchaseRevenueCatPackage(pkg: PurchasesPackage, userId: string) {
  return runRevenueCatExclusive(async () => {
    await ensureRevenueCatUserUnlocked(userId);
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return customerInfo;
  });
}

/** Restaurează cumpărăturile utilizatorului din magazin. */
export async function restoreRevenueCatPurchases(userId: string): Promise<CustomerInfo> {
  return runRevenueCatExclusive(async () => {
    await ensureRevenueCatUserUnlocked(userId);
    return Purchases.restorePurchases();
  });
}

/** Verifică dacă entitelment-ul Premium este activ în CustomerInfo. */
export function isPremiumActive(info: CustomerInfo | null | undefined) {
  return Boolean(info?.entitlements.active[PREMIUM_ENTITLEMENT_ID]?.isActive);
}

function isWithinExpiration(expirationDate: string | null | undefined) {
  if (!expirationDate) return true;
  return new Date(expirationDate).getTime() > Date.now();
}

/**
 * Determină planul activ (lunar/anual) și starea abonamentului din RevenueCat,
 * dacă există un entitelment activ.
 */
export function customerInfoToSubscriptionRow(info: CustomerInfo | null | undefined) {
  const entitlement = info?.entitlements.active[PREMIUM_ENTITLEMENT_ID];
  if (!entitlement?.isActive) return null;

  const productId = entitlement.productIdentifier ?? '';
  const plan = productId.includes('annual') ? 'annual' : 'monthly';
  const now = new Date().toISOString();
  const currentPeriodEnd = entitlement.expirationDate ?? now;
  const willRenew = entitlement.willRenew;

  // Dacă perioada a expirat, tratăm abonamentul ca expirat.
  if (!isWithinExpiration(currentPeriodEnd)) {
    return {
      status: 'expired' as const,
      plan,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: true,
    };
  }

  return {
    status: willRenew ? ('active' as const) : ('expired' as const),
    plan,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: !willRenew,
  };
}

/** Verifică dacă o eroare reprezintă o anulare a cumpărării de către utilizator. */
export function isPurchaseCancelledError(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    return code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
  }
  return false;
}

/**
 * Textul unei erori de cumpărare/restaurare, pentru ecran.
 *
 * Motivul (build 12, 10.10.2026): când `purchasePackage` arunca, ecranul Premium scria doar
 * „nu s-a putut finaliza cumpărarea", iar mesajul real al SDK-ului (cod + motiv) se pierdea.
 * Așa, un eșec al magazinului nu se mai poate confunda cu „nu s-a întâmplat nimic": codul
 * RevenueCat (`code`), mesajul lui (`message`) și cauza din magazin (`underlyingErrorMessage`)
 * ajung amândouă pe ecran, mici, sub buton.
 */
export function describePurchaseError(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      underlyingErrorMessage?: unknown;
    };
    const parts = [
      typeof candidate.code === 'string' || typeof candidate.code === 'number'
        ? `code ${String(candidate.code)}`
        : null,
      typeof candidate.message === 'string' && candidate.message.trim().length > 0
        ? candidate.message.trim()
        : null,
      typeof candidate.underlyingErrorMessage === 'string' && candidate.underlyingErrorMessage.trim().length > 0
        ? candidate.underlyingErrorMessage.trim()
        : null,
    ].filter((part): part is string => part !== null);
    if (parts.length > 0) return parts.join(' | ');
  }
  return String(error);
}

/**
 * Entitlement-ul Premium citit dupa `lookup_key = 'premium'`.
 *
 * `CustomerInfo.entitlements.active` este indexat chiar dupa `lookup_key`-ul definit in panoul
 * RevenueCat, deci `active[PREMIUM_ENTITLEMENT_ID]` ESTE entitlement-ul cerut — nu unul dedus din
 * numele produsului. Ecranul Premium avea nevoie de trei lucruri pe care `isPremiumActive` nu le
 * dadea: data de expirare (ca s-o arate omului), planul (lunar/anual) si dovada a ce a intors
 * RevenueCat atunci cand entitlement-ul NU e activ desi magazinul a confirmat plata.
 */
export type PremiumEntitlement = {
  isActive: boolean;
  plan: RevenueCatPlan | null;
  expirationDate: string | null;
  willRenew: boolean;
  productIdentifier: string | null;
};

export function readPremiumEntitlement(
  info: CustomerInfo | null | undefined,
): PremiumEntitlement {
  const entitlement = info?.entitlements.active[PREMIUM_ENTITLEMENT_ID];
  const productIdentifier = entitlement?.productIdentifier ?? null;
  const isActive = Boolean(entitlement?.isActive);
  return {
    isActive,
    plan: isActive ? (productIdentifier?.includes('annual') ? 'annual' : 'monthly') : null,
    expirationDate: entitlement?.expirationDate ?? null,
    willRenew: entitlement?.willRenew === true,
    productIdentifier,
  };
}

/**
 * Diagnosticul afisat mic pe ecran cand `entitlements.active` e gol desi magazinul a confirmat
 * plata (build 13, 10.10.2026): ce utilizator vede RevenueCat, ce chei are in `active` si ce chei
 * are in `all`. Fara el, „butoanele de cumparare au reapărut" nu se poate deosebi de „entitlement-ul
 * e pe alt utilizator" sau de „cheia din panou nu e `premium`".
 *
 * Build 14 (10.10.2026, cerinta 3): `originalAppUserId` singur nu a fost destul — RevenueCat nu vedea
 * niciun entitlement activ pentru niciun client recent, desi Apple confirma plata. `managementURL`
 * este linkul cu care Apple isi gestioneaza abonamentul: daca exista, magazinul stie de un abonament
 * pentru utilizatorul asta; daca e gol, nu stie. Se afiseaza permanent, mic, pe ecranul Premium.
 */
export function describeEntitlements(info: CustomerInfo | null | undefined): string[] {
  if (!info) return ['customerInfo = null (starea de abonament inca nu a fost citita)'];
  const active = Object.keys(info.entitlements.active ?? {});
  const all = Object.keys(info.entitlements.all ?? {});
  return [
    `customerInfo.originalAppUserId = ${info.originalAppUserId}`,
    `entitlements.active (${active.length}): ${active.length > 0 ? active.join(', ') : '(gol)'}`,
    `entitlements.all (${all.length}): ${all.length > 0 ? all.join(', ') : '(gol)'}`,
    `customerInfo.managementURL = ${info.managementURL ? info.managementURL : '(gol)'}`,
    `'${PREMIUM_ENTITLEMENT_ID}' activ = ${isPremiumActive(info)}`,
  ];
}


