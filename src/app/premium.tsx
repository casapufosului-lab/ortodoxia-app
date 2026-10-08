import { router } from 'expo-router';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRef, useState, useEffect } from 'react';

import { Card, PageHeader, PrimaryButton, Screen, SecondaryButton } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { type TranslationKey } from '@/i18n/config';
import { useRevenueCat } from '@/hooks/use-revenuecat';
import { useSubscription } from '@/hooks/use-subscription';
import { useLegalFill } from '@/lib/legal-fields';
import { isRevenueCatConfigured } from '@/lib/revenuecat';
import { manageSubscriptionUrl } from '@/lib/store-links';
import {
  PENDING_ACTIVATION_POLL_INTERVAL_MS,
  premiumScreenState,
  shouldPollPendingActivation,
  shouldShowPurchaseButtons,
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
  const { t, region } = useLocalization();
  const fillLegal = useLegalFill();
  const { dailyAiLimit, error, isLoading, isPremium, planLabel, revenueCatActive, refresh, subscription } = useSubscription();
  const { buy, loading, offeringsError, priceFor, restore } = useRevenueCat();
  const [purchaseResult, setPurchaseResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busyPlan, setBusyPlan] = useState<'monthly' | 'annual' | 'restore' | null>(null);

  // Poziția B1 din audit: magazinul poate confirma un abonament înainte ca webhook-ul RevenueCat să
  // fi scris rândul din `subscriptions` (întârziere de câteva secunde, sau webhook oprit). În starea
  // aceea plata e deja făcută: spunem explicit că activarea e în curs, dăm un contact de suport și
  // NU mai oferim butoanele de cumpărare.
  // `Boolean(...)`: `isRevenueCatConfigured()` are tipul de întoarcere `boolean | (() => Promise<boolean>)`
  // (tiparul RevenueCat pentru `Purchases.isConfigured`), iar starea ecranului cere un boolean curat.
  const screenState = premiumScreenState(subscription, Boolean(revenueCatActive && isRevenueCatConfigured()));
  const showPurchaseButtons = shouldShowPurchaseButtons(screenState);
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
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusyPlan(null);
    }
  };

  return (
    <Screen>
      <PageHeader eyebrow={t('premium.eyebrow')} title={t('premium.title')} subtitle={t('premium.subtitle')} />
      <Card style={styles.statusCard}>
        <Text style={styles.statusLabel}>{t('premium.statusLabel')}</Text>
        <Text style={styles.statusValue}>{isLoading ? t('premium.statusChecking') : isPremium ? planLabel : revenueCatActive && revenueCatActive.plan === 'annual' ? t('premium.statusAnnual') : revenueCatActive ? t('premium.statusMonthly') : planLabel}</Text>
        <Text style={styles.statusBody}>{isPremium ? t('premium.aiLimitBody').replace('{count}', String(dailyAiLimit)) : revenueCatActive ? t('premium.syncingBody') : t('premium.freeBody')}</Text>
        {subscription?.current_period_end && isPremium ? <Text style={styles.expiry}>{t('premium.expiryLabel').replace('{date}', new Date(subscription.current_period_end).toLocaleDateString(region.locale))}</Text> : null}
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
        {showPurchaseButtons ? <PrimaryButton disabled={busyPlan !== null} label={user ? (busyPlan === 'monthly' ? t('premium.processing') : t('premium.activateMonthly')) : t('premium.loginToSubscribe')} onPress={() => void purchase('monthly')} /> : null}
      </Card>
      <Card>
        <Text style={styles.plan}>{t('premium.planAnnual')}</Text>
        <Text style={styles.introPrice}>{annualPrice ?? t('premium.priceInStore')}</Text>
        <Text style={styles.price}>{t('premium.renewsAutomatically')}</Text>
        {showPurchaseButtons ? <PrimaryButton disabled={busyPlan !== null} label={user ? (busyPlan === 'annual' ? t('premium.processing') : t('premium.activateAnnual')) : t('premium.loginToSubscribe')} onPress={() => void purchase('annual')} /> : null}
      </Card>
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
  successMessage: { color: palette.success, fontSize: 14, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  cross: { color: palette.gold, fontSize: 34, textAlign: 'center', marginBottom: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { color: palette.gold, fontSize: 18, fontWeight: '800' },
  benefit: { color: '#FFFFFF', fontSize: 15, flex: 1 },
  plan: { color: palette.ink, fontSize: 20, fontWeight: '800' },
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
});
