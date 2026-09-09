import { useCallback, useEffect, useRef, useState } from 'react';
import Purchases, {
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type PurchasesPackage,
} from 'react-native-purchases';

import {
  clearRevenueCatUser,
  configureRevenueCat,
  customerInfoToSubscriptionRow,
  identifyRevenueCatUser,
  isPremiumActive,
  isPurchaseCancelledError,
  isRevenueCatConfigured,
  packageForPlan,
  packagePriceText,
  purchaseRevenueCatPackage,
  restoreRevenueCatPurchases,
  type RevenueCatPlan,
} from '@/lib/revenuecat';
import type { SubscriptionRow } from '@/lib/subscription';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

type PurchaseResult =
  | { ok: true; message: string }
  | { ok: false; message: string; cancelled: boolean };

/**
 * Expune starea si actiunile RevenueCat (ofrande, abonament activ, cumparare,
 * restaurare). Se integreaza cu utilizatorul Supabase. Sincronizarea in tabelul
 * subscriptions se face server-side prin webhook-ul RevenueCat.
 */
export function useRevenueCat() {
  const { user } = useAuth();
  const { t } = useLocalization();
  const userId = user?.id ?? null;

  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [offeringsError, setOfferingsError] = useState('');

  const previousUserIdRef = useRef(userId);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!isRevenueCatConfigured()) {
      setPackages(null);
      setCustomerInfo(null);
      return;
    }
    try {
      const [offeringsResult, info] = await Promise.all([
        Purchases.getOfferings(),
        Purchases.getCustomerInfo(),
      ]);
      if (!mountedRef.current) return;
      const available = offeringsResult.current?.availablePackages ?? null;
      setPackages(available);
      setCustomerInfo(info);
      setOfferingsError('');
    } catch {
      if (!mountedRef.current) return;
      setOfferingsError(t('premium.offeringsError'));
    }
  }, [t]);

  useEffect(() => {
    configureRevenueCat();
    if (!isRevenueCatConfigured()) return;

    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  // Leaga utilizatorul autentificat de un App User ID in RevenueCat.
  useEffect(() => {
    if (!isRevenueCatConfigured()) return;
    if (userId) {
      void identifyRevenueCatUser(userId);
    }
  }, [userId]);

  // La deconectare, dezleaga utilizatorul de RevenueCat.
  useEffect(() => {
    if (isRevenueCatConfigured() && userId === null && previousUserIdRef.current !== null) {
      void clearRevenueCatUser();
    }
    previousUserIdRef.current = userId;
  }, [userId]);

  // Aboneaza-te la actualizarile CustomerInfo (ex: cumparare facuta in alta parte,
  // revocare, restaurare). Nu sunt impinse activ, deci este doar o sursa suplimentara.
  useEffect(() => {
    if (!isRevenueCatConfigured()) return;
    const listener: CustomerInfoUpdateListener = (info: CustomerInfo) => {
      setCustomerInfo(info);
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  const activeRow: SubscriptionRow | null = customerInfo
    ? (customerInfoToSubscriptionRow(customerInfo) as SubscriptionRow | null)
    : null;

  const buy = useCallback(
    async (plan: RevenueCatPlan): Promise<PurchaseResult> => {
      if (!isRevenueCatConfigured() || !packages) {
        return { ok: false, message: t('premium.storeUnavailable'), cancelled: false };
      }
      const pkg = packageForPlan(packages, plan);
      if (!pkg) {
        return { ok: false, message: t('premium.planUnavailable'), cancelled: false };
      }
      if (!userId) {
        return { ok: false, message: t('premium.purchaseFailed'), cancelled: false };
      }

      setLoading(true);
      try {
        const info = await purchaseRevenueCatPackage(pkg, userId);
        if (!mountedRef.current) return { ok: false, message: t('premium.purchaseFailed'), cancelled: false };
        setCustomerInfo(info);
        if (isPremiumActive(info)) {
          return { ok: true, message: t('premium.activated') };
        }
        return { ok: false, message: t('premium.paymentPending'), cancelled: false };
      } catch (error) {
        if (!mountedRef.current) return { ok: false, message: t('premium.purchaseFailed'), cancelled: false };
        if (isPurchaseCancelledError(error)) {
          return { ok: false, message: t('premium.purchaseCancelled'), cancelled: true };
        }
        return { ok: false, message: t('premium.purchaseFailed'), cancelled: false };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [packages, t, userId],
  );

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    if (!isRevenueCatConfigured()) {
      return { ok: false, message: t('premium.storeUnavailable'), cancelled: false };
    }
    if (!userId) {
      return { ok: false, message: t('premium.restoreFailed'), cancelled: false };
    }

    setLoading(true);
    try {
      const info = await restoreRevenueCatPurchases(userId);
      if (!mountedRef.current) return { ok: false, message: t('premium.restoreFailed'), cancelled: false };
      setCustomerInfo(info);
      return isPremiumActive(info)
        ? { ok: true, message: t('premium.restoreSuccess') }
        : { ok: false, message: t('premium.restoreNone'), cancelled: false };
    } catch {
      if (!mountedRef.current) return { ok: false, message: t('premium.restoreFailed'), cancelled: false };
      return { ok: false, message: t('premium.restoreFailed'), cancelled: false };
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [t, userId]);

  const priceFor = useCallback(
    (plan: RevenueCatPlan) => {
      if (!packages) return null;
      const pkg = packageForPlan(packages, plan);
      return pkg ? packagePriceText(pkg) : null;
    },
    [packages],
  );

  return {
    packages,
    customerInfo,
    activeRow,
    isPremium: isPremiumActive(customerInfo),
    loading,
    offeringsError,
    priceFor,
    buy,
    restore,
    refresh,
  };
}
