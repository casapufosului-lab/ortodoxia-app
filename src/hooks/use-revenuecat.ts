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
  describeEntitlements,
  describePurchaseError,
  getRevenueCatCustomerInfo,
  identifyRevenueCatUser,
  isPremiumActive,
  isPurchaseCancelledError,
  isRevenueCatConfigured,
  packageForPlan,
  packagePriceText,
  PREMIUM_ENTITLEMENT_ID,
  purchaseRevenueCatPackage,
  readPremiumEntitlement,
  restoreRevenueCatPurchases,
  type RevenueCatPlan,
} from '@/lib/revenuecat';
import {
  STORE_STATE_UNKNOWN_TIMEOUT_MS,
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

type SettledResult<T> = { ok: true; value: T } | { ok: false; reason: unknown };

/**
 * Dovada ultimei sincronizari MANUALE cu magazinul (R1, build 19, 10.10.2026). Se afiseaza permanent,
 * mic, pe ecranul Premium: fara ea, „RevenueCat nu vede abonamentul" nu se poate deosebi de „achiziția
 * a intrat pe un app_user_id anonim" (primul lucru de exclus) sau de „restaurarea a picat cu o eroare
 * de retea". Raportul se produce cand omul apasa „Restaureaza cumparaturile"; sincronizarea NU mai
 * ruleaza automat nicaieri.
 */
export type StoreSyncReport = {
  /** Momentul (ora locala) la care a rulat sincronizarea. */
  at: string;
  /** `true` cand `Purchases.restorePurchases()` a reusit fara eroare. */
  restored: boolean;
  /** Motivul eșecului (cod + text din SDK), gol cand a reusit. */
  error: string;
  /** Randuri de diagnostic afisate pe ecran (aceeasi forma ca `entitlementDiagnostics`). */
  lines: string[];
};

/** Judeca o promisiune fara s-o lase sa arunce: rezultatul se publica separat de celelalte. */
function settle<T>(promise: Promise<T>): Promise<SettledResult<T>> {
  return promise.then(
    (value): SettledResult<T> => ({ ok: true, value }),
    (reason): SettledResult<T> => ({ ok: false, reason }),
  );
}

/**
 * Expune starea si actiunile RevenueCat (ofrande, abonament activ, cumparare,
 * restaurare). Se integreaza cu utilizatorul Supabase. Sincronizarea in tabelul
 * subscriptions se face server-side prin webhook-ul RevenueCat.
 *
 * Din build 13 (10.10.2026) expune si entitlement-ul citit direct din
 * `CustomerInfo.entitlements.active['premium']` (`entitlement`), diagnosticul lui
 * (`entitlementDiagnostics`) si eroarea citirii (`customerInfoError`), ca ecranul Premium sa poata
 * spune „Premium activ" + data de expirare si sa ascunda butoanele de cumparare.
 * `restorePurchases` NU se mai cheama automat (R1, build 19, 10.10.2026): la pornire/login se face
 * `Purchases.logIn(<id Supabase>)` + `Purchases.getCustomerInfo()`, iar `Purchases.restorePurchases()`
 * se cheama EXCLUSIV din butonul „Restaureaza cumparaturile" (`restore()` și raportul `syncWithStore`
 * din `premium.tsx`). Motivul (documentația RevenueCat): o achiziție făcută anonim se aliasează
 * automat la `logIn`, deci restaurarea programatică nu era necesară — și exact ea producea
 * comportamentul surpriză raportat de owner (operatii care schimbă ceva în cont fără cerere).
 */
export function useRevenueCat() {
  const { user } = useAuth();
  const { t } = useLocalization();
  const userId = user?.id ?? null;

  const [packages, setPackages] = useState<PurchasesPackage[] | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [offeringsError, setOfferingsError] = useState('');
  // Motivul pentru care starea de abonament nu a putut fi citita (identitate schimbata, SDK,
  // retea). Se afiseaza mic, langa diagnostic: altfel „nu s-a citit" arata exact ca „nu are
  // abonament".
  const [customerInfoError, setCustomerInfoError] = useState('');
  // OBIECTIV 1: `loading` este „nu am citit încă", ca să nu confundăm „nu s-a citit" cu „nu există
  // oferte" — două stări cu mesaje diferite pe ecranul Premium.
  const [offeringsLoad, setOfferingsLoad] = useState<StoreOfferingsLoad>('loading');
  // `null` = încă necunoscut; doar `false` explicit blochează cumpărarea.
  const [canMakePayments, setCanMakePayments] = useState<boolean | null>(null);
  const [customerInfoUserId, setCustomerInfoUserId] = useState<string | null>(null);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  // Dovada ultimei sincronizari MANUALE cu magazinul: se afiseaza permanent pe ecranul Premium.
  // R1 (build 19, 10.10.2026): raportul se produce doar cand omul apasa „Restaureaza cumparaturile”
  // (sincronizarea nu mai ruleaza automat nicaieri).
  const [storeSync, setStoreSync] = useState<StoreSyncReport | null>(null);
  // T4 (10.10.2026) — fereastra „starea magazinului e necunoscuta” are un capat de 10 secunde
  // (`STORE_STATE_UNKNOWN_TIMEOUT_MS`). Se tine per utilizator (`userId`), ca un utilizator nou sa nu
  // mosteneasca ceasul expirat al celui dinainte.
  const [unknownWindow, setUnknownWindow] = useState<{ userId: string | null; elapsed: boolean }>({ userId: null, elapsed: false });

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
      // Bug build 13 (10.10.2026): `Purchases.getOfferings()` si citirea `CustomerInfo` erau in
      // acelasi `Promise.all`, deci o eroare de OFERTE arunca tot blocul si `customerInfo` ramanea
      // `null` — ecranul Premium arata din nou butoanele de cumparare desi abonamentul era platit.
      // Acum fiecare promisiune se judeca separat si se publica separat: starea de abonament nu mai
      // depinde de oferte, iar ofertele nu mai depind de abonament.
      const [offeringsOutcome, infoOutcome] = await Promise.all([
        settle(Purchases.getOfferings()),
        settle(requestUserId ? getRevenueCatCustomerInfo(requestUserId) : Promise.resolve(null)),
      ]);

      if (
        !mountedRef.current ||
        refreshRequestRef.current !== requestId ||
        userIdRef.current !== requestUserId
      ) return;

      if (offeringsOutcome.ok) {
        setPackages(offeringsOutcome.value.current?.availablePackages ?? null);
        setOfferingsError('');
        setOfferingsLoad('loaded');
      } else {
        setOfferingsError(t('premium.offeringsError'));
        setOfferingsLoad('error');
      }

      // Cerinta 2 (build 13): starea reala vine din `Purchases.getCustomerInfo()`, citita pentru
      // utilizatorul curent, si se publica chiar daca ofertele au picat — nu din memoria aplicatiei.
      if (infoOutcome.ok) {
        setCustomerInfoUserId(requestUserId);
        setCustomerInfo(infoOutcome.value);
        setCustomerInfoError('');
      } else {
        setCustomerInfoError(describePurchaseError(infoOutcome.reason));
      }
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
  // Cerinta 1 + 3 (build 13, 10.10.2026): entitlement-ul se citeste dupa `lookup_key = 'premium'`
  // din `CustomerInfo.entitlements.active`, pentru utilizatorul curent. `activeRow` (randul de
  // abonament) se citeste din ACELASI obiect, deci cele doua nu pot ajunge in dezacord.
  const entitlement = readPremiumEntitlement(currentCustomerInfo);
  const entitlementDiagnostics = describeEntitlements(currentCustomerInfo);
  // CERINTA 1 (bug „Plan Gratuit" + butoane disparute, build 16 -> 18, 10.10.2026): valoarea UNICA din
  // care ecranul Premium isi deriva toata interfata — exact
  // `customerInfo?.entitlements.active['premium']` (`lookup_key = 'premium'`; `PREMIUM_ENTITLEMENT_ID`
  // este chiar acel sir, vezi `src/lib/revenuecat.ts`). Se calculeaza O SINGURA DATA, aici.
  const premium = currentCustomerInfo?.entitlements.active[PREMIUM_ENTITLEMENT_ID] ?? null;
  const premiumActive = premium?.isActive === true;
  // Fail-closed: daca SDK-ul magazinului este configurat si nicio citire de `CustomerInfo` nu a
  // reusit inca, starea magazinului este NECUNOSCUTA (nu „fara abonament") — nu i se ofera din nou
  // cumpararea unui om care poate fi deja abonat (pozitia B1 din audit). Cu SDK-ul neconfigurat nu
  // exista risc de dubla cumparare, deci acolo butoanele raman vizibile (dezactivate, cu mesajul
  // „magazinul nu e disponibil", ca inainte).
  const premiumKnown = currentCustomerInfo !== null || !isRevenueCatConfigured();

  // T4 (10.10.2026) — „NECUNOSCUT” NU E O STARE DE DURATA. Cat timp nici o citire `CustomerInfo` nu a
  // reusit pentru utilizatorul curent, pornim un singur ceas de 10 secunde; cand expira, starea de
  // ecran trece pe „inactiv” si butoanele de cumparare devin VIZIBILE (inainte puteau ramane ascunse
  // la nesfarsit, iar omul nu avea ce apasa). Aceeasi inchidere a ferestrei se produce si cand citirea
  // a esuat explicit (`customerInfoError`, vezi `storeStateUnknownError`).
  useEffect(() => {
    if (premiumKnown) return undefined;
    const timeoutId = setTimeout(() => setUnknownWindow({ userId, elapsed: true }), STORE_STATE_UNKNOWN_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [premiumKnown, userId]);
  const storeStateUnknownExpired = !premiumKnown && unknownWindow.userId === userId && unknownWindow.elapsed;
  const storeStateUnknownError = !premiumKnown && customerInfoError !== '';

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
        // Codul + motivul din SDK se adaugă la mesajul tradus: fără ele, „nu s-a putut
        // finaliza cumpărarea" nu spunea dacă a picat magazinul, cheia sau produsul, iar pe
        // ecran nu se vedea nicio explicație (build 12, 10.10.2026).
        return { ok: false, message: `${t('premium.purchaseFailed')} (${describePurchaseError(error)})`, cancelled: false };
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
    } catch (error) {
      if (!mountedRef.current || userIdRef.current !== userId) return { ok: false, message: t('premium.restoreFailed'), cancelled: false };
      return { ok: false, message: `${t('premium.restoreFailed')} (${describePurchaseError(error)})`, cancelled: false };
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
   * Sincronizarea MANUALA cu magazinul (R1, build 19, 10.10.2026) — raportul citit de owner pe telefon.
   *
   * De ce exista: DSH a verificat in RevenueCat (API v2) ca NICIUN client recent nu are entitlement activ,
   * desi Apple a confirmat plata — deci RevenueCat nu vede abonamentul pe utilizatorul autentificat.
   * Cauza cea mai probabila este ca achizitia a intrat pe un `app_user_id` ANONIM
   * (`$RCAnonymousID:...`) sau ca receipt-ul nu a fost re-validat dupa configurarea cheii IAP.
   *
   * R1: functia aceasta NU mai ruleaza automat — o cheama EXCLUSIV butonul „Restaureaza cumparaturile"
   * (`premium.tsx`, `handleRestore`). Aliasing-ul unei achizitii anonime il face deja
   * `Purchases.logIn(<id Supabase>)` (documentatia RevenueCat), deci restaurarea programatica nu era
   * necesara; ea ramane o actiune ceruta de om.
   *
   * Ordinea conteaza: `restoreRevenueCatPurchases(userId)` face `Purchases.logIn(userId)` INAINTE de
   * `Purchases.restorePurchases()` (vezi `lib/revenuecat.ts`), iar `getRevenueCatCustomerInfo` face
   * aceeasi verificare de identitate inainte de citire. Aici nu se cheama SDK-ul direct, ca sa nu existe
   * o cale care ocoleste `runRevenueCatExclusive` (o singura operatie RevenueCat o data).
   *
   * Fail-closed (R4): fara SDK configurat sau fara utilizator autentificat nu se cheama nimic si nu se
   * publica nimic; un rezultat sosit dupa schimbarea contului este aruncat, ca sa nu se afiseze
   * entitlement-ul altui om.
   */
  const syncWithStore = useCallback(async (): Promise<void> => {
    if (!isRevenueCatConfigured()) return;
    if (!userId) return;
    const syncUserId = userId;

    let info: CustomerInfo | null = null;
    let restored = false;
    let syncError = '';

    try {
      // Pasul 1 — restaurarea: muta eventuala achizitie de pe dispozitiv pe utilizatorul curent.
      info = await restoreRevenueCatPurchases(syncUserId);
      restored = true;
    } catch (error) {
      syncError = describePurchaseError(error);
    }

    try {
      // Pasul 2 — citirea (ceruta explicit dupa restaurare): chiar si cand restaurarea a picat, ultima
      // stare cunoscuta a magazinului se citeste, altfel un eșec de retea lasa ecranul pe „plan gratuit".
      const read = await getRevenueCatCustomerInfo(syncUserId);
      if (read) info = read;
    } catch (error) {
      const readError = describePurchaseError(error);
      syncError = syncError ? `${syncError} | ${readError}` : readError;
    }

    // Ce e in SDK nu e neaparat ce crede aplicatia: daca ID-ul SDK-ului e anonim (`$RCAnonymousID:`),
    // exact asta explica de ce RevenueCat nu vede abonamentul. Se citeste separat, ca un eșec al lui
    // sa nu strice sincronizarea.
    let sdkUserId = '(necunoscut)';
    try {
      sdkUserId = await Purchases.getAppUserID();
    } catch (error) {
      sdkUserId = `(eroare: ${describePurchaseError(error)})`;
    }

    if (!mountedRef.current || userIdRef.current !== syncUserId) return;

    if (info) {
      setCustomerInfoUserId(syncUserId);
      setCustomerInfo(info);
      setCustomerInfoError('');
    } else {
      setCustomerInfoError(syncError);
    }

    setStoreSync({
      at: new Date().toLocaleTimeString(),
      restored,
      error: syncError,
      lines: [
        `sincronizare MANUALA (butonul „Restaureaza cumparaturile”: restorePurchases + getCustomerInfo) la ${new Date().toLocaleTimeString()}`,
        `Purchases.getAppUserID() = ${sdkUserId}`,
        `utilizator Supabase (userId) = ${syncUserId}`,
        `Purchases.restorePurchases() = ${restored ? 'reusit' : `EȘUAT: ${syncError}`}`,
        ...describeEntitlements(info),
      ],
    });
  }, [userId]);

  // R1 (build 19, 10.10.2026) — AICI se chema AUTOMAT `syncWithStore()` (restorePurchases +
  // getCustomerInfo) la fiecare login. Nu mai facem asta, din doua motive:
  //   1. `Purchases.logIn(<id Supabase>)` (efectul de identificare de mai sus) aliasează AUTOMAT
  //      achiziția făcută anonim — documentația RevenueCat o spune explicit. Restaurarea
  //      programatică era deci degeaba și, în plus, exact ea producea comportamentul surpriză
  //      raportat de owner (operatii care schimba ceva în cont fara ca omul să fi cerut).
  //   2. `Purchases.restorePurchases()` se cheamă EXCLUSIV din butonul „Restaureaza cumparaturile"
  //      (`premium.tsx`, prin `restore()` + `syncWithStore()`), la cererea omului.
  // Ce rămâne automat este DOAR citirea (T4-4): după `logIn` forțăm o citire
  // `getCustomerInfo()`, ca fereastra de identitate să nu lase ecranul pe „se activeaza" / „necunoscut"
  // până la următoarea ocazie. `refresh()` NU restaurează și NU schimbă nimic în cont.
  useEffect(() => {
    if (!isRevenueCatConfigured()) return undefined;
    if (!userId) return undefined;
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh, userId]);

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
    entitlement,
    entitlementDiagnostics,
    // Cerinta 1 (build 18): valoarea unica pentru ecranul Premium (eticheta + expirare + butoane).
    premium,
    premiumActive,
    premiumKnown,
    customerInfoError,
    // T4 (10.10.2026): cele doua motive pentru care fereastra „necunoscut” se inchide si ecranul
    // Premium arata butoanele (citirea a esuat / au trecut 10 secunde). Vezi `premiumUiState`.
    storeStateUnknownError,
    storeStateUnknownExpired,
    storeSync,
    syncWithStore,
    // `isPremiumActive(currentCustomerInfo)` citeste EXACT aceeasi valoare ca `premiumActive` de mai
    // sus (`entitlements.active['premium'].isActive`), pe acelasi obiect: cele doua nu pot diferi.
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
