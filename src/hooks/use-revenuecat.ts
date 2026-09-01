import { useCallback, useEffect, useRef, useState } from 'react';
import Purchases, { type CustomerInfo, type Package } from 'react-native-purchases';

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
  syncRevenueCatToSupabase,
  type RevenueCatPlan,
} from '@/lib/revenuecat';
import type { SubscriptionRow } from '@/lib/subscription';
import { useAuth } from '@/providers/auth-provider';

type PurchaseResult =
  | { ok: true; message: string }
  | { ok: false; message: string; cancelled: boolean };

/**
 * Expune starea și acțiunile RevenueCat (ofrande, abonament activ, cumpărare,
 * restaurare). Se integrează cu utilizatorul Supabase și sincronizează starea
 * în tabelul `subscriptions`.
 */
export function useRevenueCat() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [packages, setPackages] = useState<Package[] | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [offeringsError, setOfferingsError] = useState('');

  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const syncToSupabase = useCallback(async (info: CustomerInfo) => {
    const id = userIdRef.current;
    if (!id) return;
    await syncRevenueCatToSupabase(id, info);
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
      const available = offeringsResult.current?.availablePackages ?? null;
      setPackages(available);
      setCustomerInfo(info);
      setOfferingsError('');
      await syncToSupabase(info);
    } catch {
      setOfferingsError('Ofrandele de abonament nu au putut fi încărcate. Încearcă din nou.');
    }
  }, [syncToSupabase]);

  useEffect(() => {
    configureRevenueCat();
    if (!isRevenueCatConfigured()) return;

    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  // Leagă utilizatorul autentificat de un App User ID în RevenueCat.
  useEffect(() => {
    if (!isRevenueCatConfigured()) return;
    const id = userIdRef.current;
    if (id) {
      void identifyRevenueCatUser(id);
    }
  }, [userId]);

  // La deconectare, dezleagă utilizatorul de RevenueCat.
  useEffect(() => {
    if (!isRevenueCatConfigured()) return;
    if (userId === null && userIdRef.current !== null) {
      void clearRevenueCatUser();
    }
  }, [userId]);

  // Abonează-te la actualizările CustomerInfo (ex: cumpărare făcută în altă parte,
  // revocare, restaurare). Nu sunt împinse activ, deci este doar o sursă suplimentară.
  useEffect(() => {
    if (!isRevenueCatConfigured()) return;
    const listener = (info: CustomerInfo) => {
      setCustomerInfo(info);
      void syncToSupabase(info);
    };
    const token = Purchases.addCustomerInfoUpdateListener(listener);
    return () => Purchases.removeCustomerInfoUpdateListener(token);
  }, [syncToSupabase]);

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
        setCustomerInfo(info);
        await syncToSupabase(info);
        return { ok: true, message: 'Abonamentul Premium a fost activat.' };
      } catch (error) {
        if (isPurchaseCancelledError(error)) {
          return { ok: false, message: 'Cumpărarea a fost anulată.', cancelled: true };
        }
        return { ok: false, message: 'Cumpărarea nu a reușit. Încearcă din nou.', cancelled: false };
      } finally {
        setLoading(false);
      }
    },
    [packages, syncToSupabase],
  );

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    if (!isRevenueCatConfigured()) {
      return { ok: false, message: 'Magazinul nu este disponibil momentan.', cancelled: false };
    }

    setLoading(true);
    try {
      const info = await restoreRevenueCatPurchases();
      setCustomerInfo(info);
      await syncToSupabase(info);
      return isPremiumActive(info)
        ? { ok: true, message: 'Cumpărăturile tale au fost restaurate.' }
        : { ok: true, message: 'Nu am găsit cumpărături de restaurat.' };
    } catch {
      return { ok: false, message: 'Restaurarea nu a reușit. Încearcă din nou.', cancelled: false };
    } finally {
      setLoading(false);
    }
  }, [syncToSupabase]);

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
