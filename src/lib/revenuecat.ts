import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage,
} from 'react-native-purchases';

import { supabase } from '@/lib/supabase';

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

/**
 * Configurează SDK-ul RevenueCat o singură dată, la pornirea aplicației.
 * Nu este un pas nativ obligatoriu (configurarea se face în JavaScript), dar
 * necesită un development build pentru a funcționa cumpărarea reală.
 */
export function configureRevenueCat() {
  if (configured) return;
  if (Platform.OS === 'web') return;

  const apiKey = Platform.OS === 'ios' ? APPLE_API_KEY : GOOGLE_API_KEY;
  if (!apiKey) {
    // Fără cheie configurată, SDK-ul nu se poate inițializa; logăm doar în dev.
    if (__DEV__) {
      console.warn('RevenueCat: lipsește cheia publică în .env.');
    }
    return;
  }

  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey });
  configured = true;
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
  await Purchases.logIn(userId);
}

/** Deconectează utilizatorul de la RevenueCat (apelat la sign-out). */
export async function clearRevenueCatUser() {
  if (!isRevenueCatConfigured()) return;
  const customerInfo = await Purchases.getCustomerInfo();
  if (customerInfo.originalAppUserId) {
    await Purchases.logOut();
  }
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

export function packageForPlan(
  packages: PurchasesPackage[],
  plan: RevenueCatPlan,
): PurchasesPackage | null {
  return packages.find((pkg) => pkg.identifier === plan) ?? null;
}

/**
 * Generează textul de preț pentru un pachet, folosind datele din magazin
 * (produsul de bază). Returnează string-ul cu simbolul monedei și prețul.
 */
export function packagePriceText(pkg: PurchasesPackage): string {
  const product = pkg.product;
  if (product?.priceString) return product.priceString;
  if (product?.price != null) return `${product.price}`;
  return 'Preț în magazin';
}

/**
 * Efectuează cumpărarea unui pachet. Returnează CustomerInfo actualizat.
 * Aruncă o eroare dacă utilizatorul a anulat, cu codul specific.
 */
export async function purchaseRevenueCatPackage(pkg: PurchasesPackage) {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

/** Restaurează cumpărăturile utilizatorului din magazin. */
export async function restoreRevenueCatPurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
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

/**
 * Sincronizează starea abonamentului în Supabase (tabelul `subscriptions`),
 * sursa folosită de funcțiile edge pentru limitele AI. Apelat după o cumpărare,
 * o restaurare sau o schimbare de CustomerInfo.
 */
export async function syncRevenueCatToSupabase(userId: string, info: CustomerInfo) {
  const row = customerInfoToSubscriptionRow(info);
  if (!row) return;

  await supabase.from('subscriptions').upsert({
    user_id: userId,
    status: row.status,
    plan: row.plan === 'annual' ? 'annual' : 'monthly',
    provider: Platform.OS === 'ios' ? 'apple' : 'google',
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
  });
}

/** Verifică dacă o eroare reprezintă o anulare a cumpărării de către utilizator. */
export function isPurchaseCancelledError(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    return code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
  }
  return false;
}


