import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { type ReactElement, useCallback, useRef, useState, useEffect } from 'react';

import { Card, PageHeader, PrimaryButton, Screen, SecondaryButton } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { type TranslationKey } from '@/i18n/config';
import { useRevenueCat } from '@/hooks/use-revenuecat';
import { useSubscription } from '@/hooks/use-subscription';
import { useLegalFill } from '@/lib/legal-fields';
import { isRevenueCatConfigured, packageForPlan } from '@/lib/revenuecat';
import { manageSubscriptionUrl } from '@/lib/store-links';
import {
  isPurchasable,
  PENDING_ACTIVATION_POLL_INTERVAL_MS,
  type PlanAction,
  premiumPlanActions,
  premiumScreenState,
  premiumUiState,
  purchaseAvailabilityMessageKey,
  shouldPollPendingActivation,
} from '@/lib/subscription';
import { useAuth } from '@/providers/auth-provider';
import { useLocalization } from '@/providers/localization-provider';

function benefits(t: (key: TranslationKey) => string): string[] {
  return [
    t('premium.benefitAiLimit'),
    t('premium.benefitFreeContent'),
    t('premium.benefitManageCancel'),
  ];
}

export default function PremiumScreen() {
  const { user } = useAuth();
  const { t, languageCode, region } = useLocalization();
  const fillLegal = useLegalFill();
  // Ordinea de la începutul destructurării (`dailyAiLimit, error, ...`) este fixată de testul
  // structural `premium-activation-pending.test.mjs`; numele noi se adaugă după ea.
  const { dailyAiLimit, error, entitlement, entitlementDiagnostics, customerInfoError, isLoading, premium, premiumActive, premiumKnown, storeStateUnknownError, storeStateUnknownExpired, subscriptionRowActive, refresh, refreshRevenueCat, storeSync, subscription, syncWithStore } = useSubscription();
  // T3 (build 21): catalogul de pachete intra in ecran — din el se citeste id-ul produsului fiecarui
  // plan (`pkg.product.identifier`), ca sa stim carui plan apartine abonamentul activ.
  const { availabilityFor, buy, loading, offeringsError, packages, priceFor, restore } = useRevenueCat();
  const [purchaseResult, setPurchaseResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busyPlan, setBusyPlan] = useState<'monthly' | 'annual' | 'restore' | null>(null);
  // T5 (14.10.2026): blocurile de diagnostic se arată DOAR la cerere (ținta invizibilă de 48x48 de mai
  // jos). Implicit ascunse: ele nu au ce căuta pe ecranul unui client plătitor.
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Poziția B1 din audit: magazinul poate confirma un abonament înainte ca webhook-ul RevenueCat să
  // fi scris rândul din `subscriptions` (întârziere de câteva secunde, sau webhook oprit). În starea
  // aceea plata e deja făcută: spunem explicit că activarea e în curs, dăm un contact de suport și
  // NU mai oferim butoanele de cumpărare.
  // Al doilea argument al `premiumScreenState` este CHIAR `premiumActive` (build 18): starea de ecran
  // nu mai are cum sa fie calculata din altceva decat valoarea unica a ecranului.
  const screenState = premiumScreenState(subscription, premiumActive);
  // CERINTELE 1-4 (bug „Plan Gratuit" + butoane disparute, build 16 -> 18, 10.10.2026): o SINGURA sursa
  // de adevar pentru tot ce se afiseaza despre abonament — `premium`, adica
  // `customerInfo.entitlements.active['premium']` (dupa `lookup_key`), calculat o data in
  // `use-revenuecat.ts`. Eticheta planului, data de expirare si vizibilitatea butoanelor de cumparare
  // ies toate din `premiumUiState(...)`, deci nu mai pot spune lucruri diferite. Inainte erau DOUA
  // expresii: eticheta din randul Supabase (isPremium ? numele planului), butoanele din entitlement
  // (starea de ecran SI negatia entitlement-ului) — exact dezechilibrul raportat.
  // T4 (10.10.2026) — FARA BUTOANE ASCUNSE: `storeStateKnown` (al treilea argument) spune „starea
  // magazinului e cunoscuta”; cand ea lipseste, `storeStateUnknownError` (citirea `CustomerInfo` a
  // esuat) sau `storeStateUnknownExpired` (au trecut 10 secunde) inchid fereastra „necunoscut” si
  // `premiumUiState` trece pe „inactiv” cu butoanele VIZIBILE, in loc sa le tina ascunse la nesfarsit.
  // T3 (build 21, 11.10.2026) — fereastra „magazinul nu a răspuns încă" se citește ÎNAINTE de `premiumUiState`,
// fiindcă intră acum și în starea fiecărui card de plan (regula: cât timp fereastra e deschisă, niciun plan
// nu primește buton). O singură definiție, aici.
  const storeStateUnresolved = !premiumKnown && !storeStateUnknownError && !storeStateUnknownExpired;
  // T3 (build 21, 11.10.2026) — ce face fiecare card de plan. Id-ul produsului activ vine din entitlement
  // (aceeași valoare care se citește în diagnosticul „entitlement 'premium'.productIdentifier"); id-urile
  // planurilor, din catalogul RevenueCat; „vandabil" din `availabilityFor(plan) === 'purchasable'`.
  const planActions = premiumPlanActions({
  premiumActive,
  activeProductId: premium?.productIdentifier ?? null,
  monthlyProductId: packageForPlan(packages ?? [], 'monthly')?.product.identifier ?? null,
  annualProductId: packageForPlan(packages ?? [], 'annual')?.product.identifier ?? null,
  monthlyPurchasable: isPurchasable(availabilityFor('monthly')),
  annualPurchasable: isPurchasable(availabilityFor('annual')),
  storeStateUnknown: storeStateUnresolved,
  });
  const { labelKey: premiumLabelKey, expirationDate: expiryIso } = premiumUiState({
  premiumActive,
  premiumExpirationDate: premium?.expirationDate ?? null,
  storeStateKnown: premiumKnown,
  storeStateUnknownError,
  storeStateUnknownExpired,
  });
  const premiumLabel = t(premiumLabelKey);
  // T4 (10.10.2026) — fereastra „starea magazinului e necunoscută" se calculează mai sus, lângă apelul
  // `premiumUiState` (T3, build 21): o singură definiție, folosită și de starea cardurilor de plan.
  // Numele planului (lunar/anual) si diagnosticul se citesc din ACELASI entitlement, doar normalizat
  // (`readPremiumEntitlement` citeste tot `entitlements.active['premium']`), nu din alta sursa.
  const premiumPlanLabel = entitlement.plan === 'annual' ? t('premium.statusAnnual') : t('premium.statusMonthly');
  const expiryDate = expiryIso ? new Date(expiryIso).toLocaleDateString(region.locale) : null;
  // Linkul „Gestionează abonamentul": pe Android duce direct în pagina de abonamente a Google Play,
  // pe iOS în cea a App Store. Pe platformele fără magazin nu se randează nimic (adresa e `null`).
  const manageSubscriptionHref = manageSubscriptionUrl(Platform.OS);
  // Guard sincron împotriva dublelor atingeri în același tick: starea React
  // `busyPlan` nu poate împiedica două apeluri înainte de re-render.
  const busyRef = useRef(false);
  // Guard împotriva mutărilor de stare React după demontarea ecranului.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // R1 (build 19, 10.10.2026) — restaurarea NU mai este automată: aici se chema, la FIECARE deschidere
  // a ecranului, `Purchases.restorePurchases()` (prin `syncWithStore`), pe motiv că restaurarea mută
  // pe utilizatorul autentificat o achiziție intrată pe un `app_user_id` anonim. Decizia R1 schimbă
  // regula: aliasing-ul îl face deja `Purchases.logIn(<id Supabase>)` (documentația RevenueCat:
  // achiziția făcută anonim se aliasează automat la `logIn`), deci restaurarea programatică era
  // degeaba — și exact ea producea comportamentul surpriză raportat de owner. Rămâne doar RE-CITIREA
  // stării reale de la magazin (`getCustomerInfo`), prin `refreshRevenueCat`, fără nicio operație care
  // schimbă ceva în cont. `restorePurchases()` se cheamă EXCLUSIV din butonul de restaurare
  // (`handleRestore`). În plus se re-citesc ofertele și rândul server-side: memoria aplicației nu
  // este sursă de adevăr.
  useFocusEffect(
    useCallback(() => {
      void refreshRevenueCat();
      void refresh();
    }, [refresh, refreshRevenueCat]),
  );

  // Cât timp magazinul confirmă abonamentul, dar rândul din baza de date nu a ajuns (webhook
  // întârziat), re-verificăm periodic — mărginit, vezi `shouldPollPendingActivation`. Fără asta,
  // plătitorul rămânea pe „plan gratuit" până la repornirea aplicației.
  useEffect(() => {
    if (screenState !== 'activation-pending') return undefined;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (!shouldPollPendingActivation(screenState, attempts)) {
        clearInterval(timer);
        return;
      }
      void refresh();
    }, PENDING_ACTIVATION_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh, screenState]);

  const monthlyPrice = priceFor('monthly');
  const annualPrice = priceFor('annual');

  // DIAGNOSTIC TEMPORAR (preț iOS) — se scoate după ce citim valorile.
  // Scopul: măsurăm, nu presupunem. Blocul afișează EXACT ce întoarce magazinul
  // (`Purchases.getOfferings()`) pentru fiecare pachet din offering-ul curent, plus ce întorc
  // `priceFor('monthly')` / `priceFor('annual')` și ce crede aplicația despre regiune/limbă.
  // Nu schimbă nimic din logica de cumpărare: `buy`, `restore`, `priceFor`, `availabilityFor`
  // și prețurile rămân exact cum erau.
  const [diagLines, setDiagLines] = useState<string[]>([]);
  const diagValue = (label: string, value: unknown): string => {
    if (value === null) return `${label} = null`;
    if (value === undefined) return `${label} = undefined`;
    if (typeof value === 'string' && value.trim() === '') return `${label} = (gol)`;
    return `${label} = ${String(value)}`;
  };
  useEffect(() => {
    let cancelled = false;
    const collect = async (): Promise<string[]> => {
      const lines: string[] = [
        diagValue('SDK configurat (isRevenueCatConfigured)', isRevenueCatConfigured()),
        diagValue("priceFor('monthly')", monthlyPrice),
        diagValue("priceFor('annual')", annualPrice),
        diagValue('aplicatie: languageCode', languageCode),
        diagValue('aplicatie: region.locale', region.locale),
        diagValue('aplicatie: region.countryCode', region.countryCode),
        diagValue('aplicatie: region.currencyCode', region.currencyCode),
        // Locale-ul brut al dispozitivului ar cere `expo-localization`, care NU este instalat in
        // proiect; nu instalăm nimic pentru un diagnostic temporar, deci raportăm ce știe aplicația.
      ];
      if (!isRevenueCatConfigured()) {
        lines.push(diagValue('getOfferings', 'sărit: SDK neconfigurat'));
        return lines;
      }
      // CERINȚA 4 (bug build 13, 10.10.2026): App User ID-ul cu care vorbește SDK-ul. Dacă
      // entitlement-ul e gol deși plata a fost confirmată, primul lucru de exclus este că
      // `Purchases.logIn(id-ul Supabase)` a ajuns pe alt utilizator decât cel care a plătit.
      try {
        lines.push(diagValue('Purchases.getAppUserID()', await Purchases.getAppUserID()));
      } catch (error) {
        lines.push(diagValue('EROARE la getAppUserID', error instanceof Error ? error.message : String(error)));
      }
      try {
        const offerings = await Purchases.getOfferings();
        const current = offerings.current;
        lines.push(diagValue('offerings.all (cate offering-uri)', Object.keys(offerings.all).length));
        lines.push(diagValue('offerings.current?.identifier', current ? current.identifier : null));
        lines.push(diagValue('offerings.current.availablePackages.length', current ? current.availablePackages.length : null));
        const packages: PurchasesPackage[] = current ? current.availablePackages : [];
        packages.forEach((pkg: PurchasesPackage, index: number) => {
          const product = pkg.product;
          lines.push(`--- pachet ${index + 1}/${packages.length} ---`);
          lines.push(diagValue('pkg.identifier', pkg.identifier));
          lines.push(diagValue('pkg.packageType', `${pkg.packageType} (${Purchases.PACKAGE_TYPE[pkg.packageType]})`));
          lines.push(diagValue('pkg.product.identifier', product?.identifier));
          lines.push(diagValue('pkg.product.priceString', product?.priceString));
          lines.push(diagValue('pkg.product.currencyCode', product?.currencyCode));
          lines.push(diagValue('pkg.product.price', product?.price));
          lines.push(diagValue('pkg.product.subscriptionPeriod', product?.subscriptionPeriod));
        });
      } catch (error) {
        lines.push(diagValue('EROARE la getOfferings', error instanceof Error ? error.message : String(error)));
      }
      return lines;
    };
    void collect().then((lines) => {
      if (!cancelled) setDiagLines(lines);
    });
    return () => { cancelled = true; };
  }, [annualPrice, languageCode, monthlyPrice, region.countryCode, region.currencyCode, region.locale]);

  // OBIECTIV 1 (paywall): butonul de cumpărare are voie să fie activ doar când magazinul poate vinde
  // planul — offering curent + pachetul planului + preț primit de la magazin (vezi `purchaseAvailability`).
  // Prețul afișat vine tot din magazin (`priceString`), prin `priceFor`; fără el nu inventăm un preț.
  const monthlyAvailability = availabilityFor('monthly');
  const annualAvailability = availabilityFor('annual');
  // Un vizitator neautentificat are butonul activ: rolul lui e să ducă la autentificare, nu să cumpere.
  const monthlyBlocked = Boolean(user) && !isPurchasable(monthlyAvailability);
  const annualBlocked = Boolean(user) && !isPurchasable(annualAvailability);
  // Mesajul care explică butonul dezactivat. `store-unavailable` e deja scris în cardul de stare,
  // deci nu îl repetăm sub fiecare plan.
  const monthlyNoticeKey = monthlyAvailability === 'store-unavailable' ? null : purchaseAvailabilityMessageKey(monthlyAvailability);
  const annualNoticeKey = annualAvailability === 'store-unavailable' ? null : purchaseAvailabilityMessageKey(annualAvailability);
  // De ce e butonul mort, chiar lângă buton (build 12, 10.10.2026): pentru „store-unavailable"
  // explicația stătea doar în cardul de status (ieșit din ecran când omul e jos, la buton), iar
  // pentru „checking" nu exista niciun text. În ambele cazuri se apăsa „Activează planul" și nu
  // se vedea nimic: fără preț de la magazin butonul rămâne blocat, dar motivul se vede acum.
  const monthlyBlockedNotice = monthlyBlocked && !monthlyNoticeKey
    ? monthlyAvailability === 'store-unavailable'
      ? t('premium.storeUnavailable')
      : t('premium.statusChecking')
    : null;
  const annualBlockedNotice = annualBlocked && !annualNoticeKey
    ? annualAvailability === 'store-unavailable'
      ? t('premium.storeUnavailable')
      : t('premium.statusChecking')
    : null;

  // CERINȚA 3 (build 14, 10.10.2026) — PERMANENT, nu temporar: ce întoarce RevenueCat se citește
  // negru pe alb, mic, pe ecranul Premium: `customerInfo.originalAppUserId`, cheile din
  // `entitlements.active`, cheile din `entitlements.all`, `customerInfo.managementURL` (dacă există)
  // — plus rezultatul ultimei sincronizări automate (`Purchases.getAppUserID()` față de id-ul
  // Supabase, `restorePurchases()` reușit/eșuat), care este exact dovada căutată pentru „achiziția a
  // intrat pe un app_user_id anonim".
  // Fără `t()`: sunt valori tehnice citite de pe telefon, nu text de interfață (același tipar ca
  // diagnosticul de preț de mai jos).
  const storeStateLines: string[] = [
    ...(storeSync ? storeSync.lines : ['sincronizarea automata cu magazinul inca nu a rulat']),
    ...entitlementDiagnostics,
  ];

  const requireUser = () => {
    if (!user) { router.push('/auth?returnTo=/premium'); return true; }
    return false;
  };

  const purchase = async (plan: 'monthly' | 'annual') => {
    if (requireUser() || busyRef.current) return;
    busyRef.current = true;
    setPurchaseResult(null);
    setBusyPlan(plan);
    try {
      const result = await buy(plan);
      if (!mountedRef.current) return;
      setPurchaseResult(result);
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusyPlan(null);
    }
  };

  const handleRestore = async () => {
    if (requireUser() || busyRef.current) return;
    busyRef.current = true;
    setPurchaseResult(null);
    setBusyPlan('restore');
    try {
      const result = await restore();
      if (!mountedRef.current) return;
      setPurchaseResult(result);
      // R1 (build 19, 10.10.2026) — SINGURUL loc din aplicatie care ajunge la
      // `Purchases.restorePurchases()`: apasarea butonului „Restaureaza cumparaturile”. Nimic nu se mai
      // declanseaza automat (nici la deschiderea ecranului, nici la login): aliasing-ul achizitiei
      // anonime il face `Purchases.logIn(<id Supabase>)`.
      // Rezultatul se aseaza pe ecran INAINTE de raport, ca mesajul omului sa nu poata fi pierdut.
      // Dupa o restaurare reusita mai cerem raportul complet (`syncWithStore`) — acesta scrie
      // diagnosticul permanent „STAREA REVENUECAT” (getAppUserID fata de id-ul Supabase + rezultatul
      // restaurarii), singura dovada citibila de pe telefon. Se cere DOAR cand restaurarea a reusit, ca
      // un esec sa nu porneasca o a doua operatie pe magazin.
      if (result.ok) void syncWithStore();
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusyPlan(null);
    }
  };

  /*
   * T3 (build 21, 11.10.2026) — ce se randează în cardul unui plan, după acțiunea lui
   * (`premiumPlanActions`, lib/subscription.ts):
   *   'current'   -> textul „Planul tău actual", FĂRĂ buton;
   *   'subscribe' -> butonul de activare (exact ca înainte de build 21);
   *   'switch'    -> butonul de schimbare a planului + nota care spune că magazinul decide data
   *                  de la care se aplică; apăsarea cheamă ACELAȘI `purchase(plan)` — schimbarea
   *                  o face magazinul, în fereastra lui;
   *   'pending'   -> fără buton (magazinul nu poate vinde planul, sau nu știm ce produs e activ);
   *                  rămân doar mesajele care explică de ce.
   */
  const planCardBody = (action: PlanAction, plan: 'monthly' | 'annual'): ReactElement | null => {
    if (action === 'current') {
      return <Text style={styles.currentPlan}>{t('premium.currentPlan')}</Text>;
    }
    const actionLabel: TranslationKey = plan === 'monthly'
      ? (action === 'switch' ? 'premium.switchToMonthly' : 'premium.activateMonthly')
      : (action === 'switch' ? 'premium.switchToAnnual' : 'premium.activateAnnual');
    const label: TranslationKey = user
      ? (busyPlan === plan ? 'premium.processing' : actionLabel)
      : 'premium.loginToSubscribe';
    const noticeKey = plan === 'monthly' ? monthlyNoticeKey : annualNoticeKey;
    const blockedNotice = plan === 'monthly' ? monthlyBlockedNotice : annualBlockedNotice;
    const blocked = plan === 'monthly' ? monthlyBlocked : annualBlocked;
    return (
      <>
        {action === 'pending' ? null : (
          <PrimaryButton disabled={busyPlan !== null || blocked} label={t(label)} onPress={() => void purchase(plan)} />
        )}
        {action === 'switch' ? <Text style={styles.storeNotice}>{t('premium.switchStoreNote')}</Text> : null}
        {noticeKey ? <Text accessibilityLiveRegion="polite" style={styles.storeNotice}>{t(noticeKey)}</Text> : null}
        {blockedNotice ? <Text accessibilityLiveRegion="polite" style={styles.storeNotice}>{blockedNotice}</Text> : null}
      </>
    );
  };

  return (
    <Screen>
      <PageHeader eyebrow={t('premium.eyebrow')} title={t('premium.title')} subtitle={t('premium.subtitle')} />
      <Card style={styles.statusCard}>
        <Text style={styles.statusLabel}>{t('premium.statusLabel')}</Text>
        <Text style={styles.statusValue}>{isLoading || storeStateUnresolved ? t('premium.statusChecking') : premiumLabel}</Text>
        {/* CERINȚA 1: când entitlement-ul `premium` din magazin este activ, cardul spune explicit
            „Premium activ" — nu „se sincronizează" (care sună a așteptare) și nu „plan gratuit". */}
        <Text accessibilityLiveRegion="polite" style={styles.statusBody}>{premiumActive ? t('premium.aiLimitBody').replace('{count}', String(dailyAiLimit)) : t('premium.freeBody')}</Text>
        {/* Data de expirare: DOAR din `premium.expirationDate` (entitlements.active['premium']). */}
        {/* Planul ales (lunar/anual) — din acelasi entitlement; eticheta de sus spune „Premium activ". */}
        {premiumActive ? <Text style={styles.expiry}>{premiumPlanLabel}</Text> : null}
        {expiryDate ? <Text style={styles.expiry}>{t('premium.expiryLabel').replace('{date}', expiryDate)}</Text> : null}
        {offeringsError ? <Text style={styles.error}>{offeringsError}</Text> : null}
        {/* Eroarea citirii stării de abonament nu are voie să rămână invizibilă: fără ea, plătitorul
            vedea „Plan Gratuit" fără nicio explicație (poziția B1 din audit). */}
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        {/* Fără cheie validă, SDK-ul nu poate fi configurat: spunem explicit că magazinul nu e
            disponibil, în loc să lăsăm doar prețul-lipsă („Preț în magazin") să sugereze altceva.
            Același text pe care `buy`/`restore` îl întorc la apăsare (use-revenuecat.ts). */}
        {!isRevenueCatConfigured() ? <Text style={styles.error}>{t('premium.storeUnavailable')}</Text> : null}
        {screenState === 'activation-pending' ? (
          <Text accessibilityLiveRegion="polite" style={styles.successMessage}>
            {fillLegal(t('premium.activationPending'))}
          </Text>
        ) : null}
        {purchaseResult ? <Text accessibilityLiveRegion="polite" style={purchaseResult.ok ? styles.successMessage : styles.errorMessage}>{purchaseResult.message}</Text> : null}
      </Card>
      <Card style={styles.hero}>
        <Text style={styles.cross}>☦</Text>
        {benefits(t).map((benefit) => <View key={benefit} style={styles.benefitRow}><Text style={styles.check}>✓</Text><Text style={styles.benefit}>{benefit}</Text></View>)}
      </Card>
      <Card>
        <Text style={styles.plan}>{t('premium.planMonthly')}</Text>
        <Text style={styles.introPrice}>{monthlyPrice ?? t('premium.priceInStore')}</Text>
        <Text style={styles.price}>{t('premium.renewsAutomatically')}</Text>
        {planCardBody(planActions.monthly, 'monthly')}
      </Card>
      <Card>
        <Text style={styles.plan}>{t('premium.planAnnual')}</Text>
        <Text style={styles.introPrice}>{annualPrice ?? t('premium.priceInStore')}</Text>
        <Text style={styles.price}>{t('premium.renewsAutomatically')}</Text>
        {planCardBody(planActions.annual, 'annual')}
      </Card>
      {/* Rezultatul ultimei acțiuni, LÂNGĂ butoane: mesajul din cardul de status e sus, în afara
          ecranului, exact când omul apasă butonul de jos — de aceea părea că nu se întâmplă nimic
          (build 12, 10.10.2026). Același text, în ambele locuri, cu codul erorii RevenueCat în el. */}
      {purchaseResult ? (
        <Text accessibilityLiveRegion="polite" style={purchaseResult.ok ? styles.successMessage : styles.errorMessage}>
          {purchaseResult.message}
        </Text>
      ) : null}
      <Card style={styles.disclosure}>
        <Text style={styles.disclosureTitle}>{t('premium.disclosureTitle')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureRenews')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureCancelLocation')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureUninstall')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureAfterCancel')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureRefunds')}</Text>
        {manageSubscriptionHref ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void Linking.openURL(manageSubscriptionHref)}
            style={styles.manageSubscription}
          >
            <Text style={styles.legalLink}>{t('premium.manageSubscription')}</Text>
          </Pressable>
        ) : null}
      </Card>
      <SecondaryButton disabled={busyPlan !== null} label={busyPlan === 'restore' ? t('premium.restoring') : t('premium.restorePurchases')} onPress={() => void handleRestore()} />
      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={palette.blue} size="small" /><Text style={styles.loadingText}>{t('premium.processingPayment')}</Text></View> : null}
      <Text style={styles.note}>{t('premium.paymentNote')}</Text>
      <View style={styles.legalLinks}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/privacy')}>
          <Text style={styles.legalLink}>{t('premium.privacyPolicy')}</Text>
        </Pressable>
        <Text style={styles.legalDivider}>·</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/terms')}>
          <Text style={styles.legalLink}>{t('premium.terms')}</Text>
        </Pressable>
      </View>
      {/* DIAGNOSTIC — ASCUNS, ca la playerul live (build 21, 11.10.2026): blocurile tehnice rămân în cod
          (și în testele structurale care le fixează), dar NU se mai văd pe ecranul omului. Defect
          dovedit 14.10.2026: captura din build-ul de CI (release) arăta „DIAGNOSTIC PREȚ (temporar)" și
          „STAREA REVENUECAT — DIAGNOSTIC PERMANENT" pe ecranul utilizatorului. Se arată doar la cerere,
          prin ținta invizibilă de 48x48 de mai jos — tiparul dovedit din `src/live/youtube-embed.native.tsx`. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Premium: detalii tehnice despre abonament'}
        onPress={() => setShowDiagnostics((visible) => !visible)}
        style={styles.diagnosticsToggle}
      />
      {showDiagnostics ? (
        <>
      {/* DIAGNOSTIC TEMPORAR (preț iOS) — se scoate după ce citim valorile. */}
      <Card>
        <Text style={styles.diagTitle}>{'DIAGNOSTIC PREȚ (temporar)'}</Text>
        {diagLines.length === 0
          ? <Text style={styles.diagText} selectable>{'se citesc valorile din magazin...'}</Text>
          : diagLines.map((line, index) => (
            <Text key={`diag-${index}`} selectable style={styles.diagText}>{line}</Text>
          ))}
        <Text selectable style={styles.diagText}>{diagValue("availabilityFor('monthly')", monthlyAvailability)}</Text>
        <Text selectable style={styles.diagText}>{diagValue("availabilityFor('annual')", annualAvailability)}</Text>
        <Text selectable style={styles.diagText}>{diagValue('ultimul rezultat (cumpărare/restaurare)', purchaseResult ? purchaseResult.message : 'niciunul')}</Text>
      </Card>
      {/* CERINȚA 3 (build 14, 10.10.2026) — DIAGNOSTIC PERMANENT (nu temporar): aici se citește negru
          pe alb ce întoarce RevenueCat, ca să nu mai ghicim de ce butoanele de cumpărare reapar.
          `storeStateLines` conține sincronizarea automată (`Purchases.getAppUserID()` față de id-ul
          Supabase + rezultatul `restorePurchases()`) și starea live din `CustomerInfo`. */}
      <Card>
        <Text style={styles.storeStateTitle}>{'STAREA REVENUECAT — DIAGNOSTIC PERMANENT'}</Text>
        {storeStateLines.map((line, index) => (
          <Text key={`store-${index}`} selectable style={styles.diagText}>{line}</Text>
        ))}
        <Text selectable style={styles.diagText}>{diagValue("entitlement 'premium'.isActive", premiumActive)}</Text>
        <Text selectable style={styles.diagText}>{diagValue("entitlement 'premium'.expirationDate", entitlement.expirationDate)}</Text>
        <Text selectable style={styles.diagText}>{diagValue("entitlement 'premium'.productIdentifier", entitlement.productIdentifier)}</Text>
        {customerInfoError ? <Text selectable style={styles.diagText}>{diagValue('EROARE la citirea customerInfo', customerInfoError)}</Text> : null}
        {/* T2 (10.10.2026) — INFORMATIV, nu o a doua sursa de adevar: randul din `subscriptions` (scris
            de webhook-ul RevenueCat) acorda Premium, dar magazinul NU confirma niciun abonament activ
            (`entitlements.active['premium']` lipseste). Ecranul afiseaza ce spune magazinul — o singura
            sursa de adevar — iar avertismentul acesta este DOVADA divergentei, deci NU se sterge tacut.
            Accesul dat de randul din baza de date nu se schimba aici: el se citeste pe server. */}
        {!premiumActive && subscriptionRowActive ? (
          <Text selectable style={styles.diagText}>{'INFORMATIV: randul din baza de date (scris de webhook-ul RevenueCat) acorda Premium, dar magazinul NU confirma niciun abonament activ (entitlements.active este gol). Ecranul afiseaza ce spune magazinul (o singura sursa de adevar, build 18 + T2, 10.10.2026), deci scrie „Plan Gratuit”.'}</Text>
        ) : null}
      </Card>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: palette.blue, borderColor: palette.blue },
  statusCard: { alignItems: 'center' },
  statusLabel: { color: palette.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  statusValue: { color: palette.goldDark, fontSize: 22, fontWeight: '800' },
  statusBody: { color: palette.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  expiry: { color: palette.blue, fontSize: 13, fontWeight: '700' },
  error: { color: palette.danger, fontSize: 13, textAlign: 'center' },
  errorMessage: { color: palette.danger, fontSize: 14, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  storeNotice: { color: palette.muted, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  successMessage: { color: palette.success, fontSize: 14, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  cross: { color: palette.gold, fontSize: 34, textAlign: 'center', marginBottom: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { color: palette.gold, fontSize: 18, fontWeight: '800' },
  benefit: { color: '#FFFFFF', fontSize: 15, flex: 1 },
  plan: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  /* T3 (build 21): planul pe care omul il are deja (fara buton). */
  currentPlan: { color: palette.blue, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  introPrice: { color: palette.goldDark, fontSize: 20, fontWeight: '800' },
  price: { color: palette.muted, fontSize: 14 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  loadingText: { color: palette.muted, fontSize: 13 },
  note: { color: palette.muted, fontSize: 12, textAlign: 'center' },
  disclosure: { backgroundColor: palette.blueSoft, borderColor: palette.blueSoft },
  disclosureTitle: { color: palette.ink, fontSize: 14, fontWeight: '800', marginBottom: 6 },
  disclosureText: { color: palette.ink, fontSize: 13, lineHeight: 19 },
  legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 4 },
  legalLink: { color: palette.blue, fontSize: 13, fontWeight: '700' },
  /* Ținta de atingere a linkului de gestionare a abonamentului: cel puțin 44 pt, ca și restul
     elementelor interactive verificate de poarta de accesibilitate. */
  manageSubscription: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 48 },
  legalDivider: { color: palette.muted, fontSize: 13 },
  /* DIAGNOSTIC TEMPORAR (preț iOS) — se scoate după ce citim valorile. */
  diagTitle: { color: palette.ink, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  /* Comutatorul INVIZIBIL al diagnosticului (tipar dovedit în `src/live/youtube-embed.native.tsx`):
     48x48, fără text și fără chenar — blocul tehnic se arată doar la cerere, nu se scurge la client. */
  diagnosticsToggle: { alignSelf: 'center', width: 48, height: 48 },
  /* CERINȚA 3 (build 14, 10.10.2026): titlul diagnosticului PERMANENT (starea din RevenueCat).
     `palette.muted` + literă mică: trebuie să fie citit de owner când are nevoie, dar să nu fure
     atenția de la planuri. */
  storeStateTitle: { color: palette.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  diagText: {
    color: palette.ink,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
});
