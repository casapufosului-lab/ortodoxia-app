import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Purchases, {
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type PurchasesPackage,
} from 'react-native-purchases';

import {
  clearRevenueCatUser,
  configureRevenueCat,
  customerInfoToSubscriptionRow,
  getRevenueCatCustomerInfo,
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
import {
  purchaseAvailability,
  type PurchaseAvailability,
  type StoreOfferingsLoad,
  type SubscriptionRow,
} from '@/lib/subscription';
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
  // OBIECTIV 1: `loading` este „nu am citit încă", ca să nu confundăm „nu s-a citit" cu „nu există
  // oferte" — două stări cu mesaje diferite pe ecranul Premium.
  const [offeringsLoad, setOfferingsLoad] = useState<StoreOfferingsLoad>('loading');
  // `null` = încă necunoscut; doar `false` explicit blochează cumpărarea.
  const [canMakePayments, setCanMakePayments] = useState<boolean | null>(null);
  const [customerInfoUserId, setCustomerInfoUserId] = useState<string | null>(null);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  const previousUserIdRef = useRef(userId);
  const mountedRef = useRef(true);
  const userIdRef = useRef(userId);
  const loadingUserIdRef = useRef<string | null>(null);
  const refreshRequestRef = useRef(0);

  useLayoutEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const requestId = ++refreshRequestRef.current;
    const requestUserId = userId;

    if (!isRevenueCatConfigured()) {
      setPackages(null);
      setCustomerInfoUserId(null);
      setCustomerInfo(null);
      return;
    }

    try {
      const [offeringsResult, info] = await Promise.all([
        Purchases.getOfferings(),
        requestUserId ? getRevenueCatCustomerInfo(requestUserId) : Promise.resolve(null),
      ]);

      if (
        !mountedRef.current ||
        refreshRequestRef.current !== requestId ||
        userIdRef.current !== requestUserId
      ) return;

      const available = offeringsResult.current?.availablePackages ?? null;
      setPackages(available);
      setCustomerInfoUserId(requestUserId);
      setCustomerInfo(info);
      setOfferingsError('');
      setOfferingsLoad('loaded');
    } catch {
      if (
        !mountedRef.current ||
        refreshRequestRef.current !== requestId ||
        userIdRef.current !== requestUserId
      ) return;
      setOfferingsError(t('premium.offeringsError'));
      setOfferingsLoad('error');
    }
  }, [t, userId]);

  useEffect(() => {
    configureRevenueCat();
    if (!isRevenueCatConfigured()) return;

    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  // Poate dispozitivul să cumpere? `canMakePayments()` întoarce o promisiune și poate arunca atunci
  // când SDK-ul nu e configurat; orice eșec îl tratăm ca „necunoscut" (`null`), iar necunoscutul NU
  // blochează butonul (vezi `purchaseAvailability`). Fără verificarea asta, un dispozitiv care nu
  // poate cumpăra primea tot buton activ, iar la apăsare vedea o eroare a magazinului, care pare
  // defect al aplicației.
  useEffect(() => {
    // `canMakePayments` porneste din `null` (necunoscut), deci aici nu e nevoie de un `setState`:
    // un `setState` sincron intr-un efect produce randari in cascada (regula react-hooks).
    if (!isRevenueCatConfigured()) return undefined;
    let cancelled = false;
    void Purchases.canMakePayments()
      .then((value) => {
        if (!cancelled && mountedRef.current) setCanMakePayments(value === true);
      })
      .catch(() => {
        if (!cancelled && mountedRef.current) setCanMakePayments(null);
      });
    return () => { cancelled = true; };
  }, []);

  // Leaga utilizatorul autentificat de un App User ID in RevenueCat.
  useEffect(() => {
    if (!isRevenueCatConfigured()) return;
    if (userId) {
      void identifyRevenueCatUser(userId);
    }
  }, [userId]);

  // La deconectare, dezleaga utilizatorul de RevenueCat.
  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (isRevenueCatConfigured() && userId === null && previousUserId !== null) {
      void clearRevenueCatUser(previousUserId);
    }
    previousUserIdRef.current = userId;
  }, [userId]);

  // Aboneaza-te la actualizarile CustomerInfo (ex: cumparare facuta in alta parte,
  // revocare, restaurare). Nu sunt impinse activ, deci este doar o sursa suplimentara.
  useEffect(() => {
    if (!isRevenueCatConfigured()) return;
    const listener: CustomerInfoUpdateListener = (_info: CustomerInfo) => {
      void refresh();
    };
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [refresh]);

  const currentCustomerInfo = customerInfoUserId === userId ? customerInfo : null;
  const activeRow: SubscriptionRow | null = currentCustomerInfo
    ? (customerInfoToSubscriptionRow(currentCustomerInfo) as SubscriptionRow | null)
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

      loadingUserIdRef.current = userId;
      setLoadingUserId(userId);
      setLoading(true);
      try {
        const info = await purchaseRevenueCatPackage(pkg, userId);
        if (!mountedRef.current || userIdRef.current !== userId) return { ok: false, message: t('premium.purchaseFailed'), cancelled: false };
        setCustomerInfoUserId(userId);
        setCustomerInfo(info);
        if (isPremiumActive(info)) {
          return { ok: true, message: t('premium.activated') };
        }
        return { ok: false, message: t('premium.paymentPending'), cancelled: false };
      } catch (error) {
        if (!mountedRef.current || userIdRef.current !== userId) return { ok: false, message: t('premium.purchaseFailed'), cancelled: false };
        if (isPurchaseCancelledError(error)) {
          return { ok: false, message: t('premium.purchaseCancelled'), cancelled: true };
        }
        return { ok: false, message: t('premium.purchaseFailed'), cancelled: false };
      } finally {
        if (mountedRef.current && loadingUserIdRef.current === userId) {
          loadingUserIdRef.current = null;
          setLoadingUserId(null);
          setLoading(false);
        }
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

    loadingUserIdRef.current = userId;
    setLoadingUserId(userId);
    setLoading(true);
    try {
      const info = await restoreRevenueCatPurchases(userId);
      if (!mountedRef.current || userIdRef.current !== userId) return { ok: false, message: t('premium.restoreFailed'), cancelled: false };
      setCustomerInfoUserId(userId);
      setCustomerInfo(info);
      return isPremiumActive(info)
        ? { ok: true, message: t('premium.restoreSuccess') }
        : { ok: false, message: t('premium.restoreNone'), cancelled: false };
    } catch {
      if (!mountedRef.current || userIdRef.current !== userId) return { ok: false, message: t('premium.restoreFailed'), cancelled: false };
      return { ok: false, message: t('premium.restoreFailed'), cancelled: false };
    } finally {
      if (mountedRef.current && loadingUserIdRef.current === userId) {
          loadingUserIdRef.current = null;
          setLoadingUserId(null);
          setLoading(false);
        }
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

  /**
   * Starea reală a magazinului pentru un plan (OBIECTIV 1): singura sursă a butonului de cumpărare.
   * Butonul se activează doar pentru `purchasable`; prețul afișat vine tot de aici.
   */
  const availabilityFor = useCallback(
    (plan: RevenueCatPlan): PurchaseAvailability => {
      const pkg = packages ? packageForPlan(packages, plan) : null;
      return purchaseAvailability({
        storeConfigured: Boolean(isRevenueCatConfigured()),
        canMakePayments,
        offeringsLoad,
        packageCount: packages?.length ?? 0,
        hasPackageForPlan: pkg !== null,
        storePrice: pkg ? packagePriceText(pkg) : null,
      });
    },
    [canMakePayments, offeringsLoad, packages],
  );

  return {
    packages,
    customerInfo: currentCustomerInfo,
    activeRow,
    isPremium: isPremiumActive(currentCustomerInfo),
    loading: loadingUserId === userId ? loading : false,
    offeringsError,
    priceFor,
    availabilityFor,
    buy,
    restore,
    refresh,
  };
}
