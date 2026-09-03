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
      setOfferingsError('Ofertele de abonament nu au putut fi încărcate. Încearcă din nou.');
    }
  }, []);

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
        return { ok: false, message: 'Magazinul nu este disponibil momentan.', cancelled: false };
      }
      const pkg = packageForPlan(packages, plan);
      if (!pkg) {
        return { ok: false, message: 'Planul ales nu este disponibil în magazin.', cancelled: false };
      }

      setLoading(true);
      try {
        const info = await purchaseRevenueCatPackage(pkg);
        if (!mountedRef.current) return { ok: false, message: 'Cumpărarea nu a reușit. Încearcă din nou.', cancelled: false };
        setCustomerInfo(info);
        if (isPremiumActive(info)) {
          return { ok: true, message: 'Abonamentul Premium a fost activat.' };
        }
        return { ok: false, message: 'Plata a fost procesată, dar Premium nu este încă activ. Verifică în câteva momente.', cancelled: false };
      } catch (error) {
        if (!mountedRef.current) return { ok: false, message: 'Cumpărarea nu a reușit. Încearcă din nou.', cancelled: false };
        if (isPurchaseCancelledError(error)) {
          return { ok: false, message: 'Cumpărarea a fost anulată.', cancelled: true };
        }
        return { ok: false, message: 'Cumpărarea nu a reușit. Încearcă din nou.', cancelled: false };
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [packages],
  );

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    if (!isRevenueCatConfigured()) {
      return { ok: false, message: 'Magazinul nu este disponibil momentan.', cancelled: false };
    }

    setLoading(true);
    try {
      const info = await restoreRevenueCatPurchases();
      if (!mountedRef.current) return { ok: false, message: 'Restaurarea nu a reușit. Încearcă din nou.', cancelled: false };
      setCustomerInfo(info);
      return isPremiumActive(info)
        ? { ok: true, message: 'Cumpărăturile tale au fost restaurate.' }
        : { ok: false, message: 'Nu am găsit cumpărături de restaurat.', cancelled: false };
    } catch {
      if (!mountedRef.current) return { ok: false, message: 'Restaurarea nu a reușit. Încearcă din nou.', cancelled: false };
      return { ok: false, message: 'Restaurarea nu a reușit. Încearcă din nou.', cancelled: false };
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

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
