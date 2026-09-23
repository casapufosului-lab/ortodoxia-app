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

export const ENTITLEMENT_PRODUCT_MAPPING: Record<RevenueCatPlan, string> = {
  monthly: 'ro.ortodoxia.premium.monthly',
  annual: 'ro.ortodoxia.premium.annual',
};

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
  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }
  Purchases.configure({ apiKey });
  configured = true;
}

/**
 * True when a configured key is a placeholder rather than a real RevenueCat key.
 *
 * `.env.example` ships values like `your_apple_api_key_here`. Those are non-empty,
 * so a naive truthiness check treats them as configured and the SDK fails later
 * with an opaque store error instead of the honest "store unavailable" path.
 */
export function isPlaceholderRevenueCatKey(apiKey: string | undefined | null): boolean {
  if (!apiKey) return true;
  return /^(your_|REPLACE|CHANGEME|xxx)/i.test(apiKey.trim());
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
 * (produsul de bază). Returnează string-ul cu simbolul monedei și prețul.
 */
export function packagePriceText(pkg: PurchasesPackage): string | null {
  const product = pkg.product;
  if (product?.priceString) return product.priceString;
  if (product?.price != null) return `${product.price}`;
  return null;
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


