import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRef, useState, useEffect } from 'react';

import { Card, PageHeader, PrimaryButton, Screen, SecondaryButton } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { type TranslationKey } from '@/i18n/config';
import { useRevenueCat } from '@/hooks/use-revenuecat';
import { useSubscription } from '@/hooks/use-subscription';
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
  const { dailyAiLimit, isLoading, isPremium, planLabel, revenueCatActive, subscription } = useSubscription();
  const { buy, loading, offeringsError, priceFor, restore } = useRevenueCat();
  const [purchaseResult, setPurchaseResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busyPlan, setBusyPlan] = useState<'monthly' | 'annual' | 'restore' | null>(null);
  // Guard sincron împotriva dublelor atingeri în același tick: starea React
  // `busyPlan` nu poate împiedica două apeluri înainte de re-render.
  const busyRef = useRef(false);
  // Guard împotriva mutărilor de stare React după demontarea ecranului.
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

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
        <PrimaryButton disabled={busyPlan !== null} label={user ? (busyPlan === 'monthly' ? t('premium.processing') : t('premium.activateMonthly')) : t('premium.loginToSubscribe')} onPress={() => void purchase('monthly')} />
      </Card>
      <Card>
        <Text style={styles.plan}>{t('premium.planAnnual')}</Text>
        <Text style={styles.introPrice}>{annualPrice ?? t('premium.priceInStore')}</Text>
        <Text style={styles.price}>{t('premium.renewsAutomatically')}</Text>
        <PrimaryButton disabled={busyPlan !== null} label={user ? (busyPlan === 'annual' ? t('premium.processing') : t('premium.activateAnnual')) : t('premium.loginToSubscribe')} onPress={() => void purchase('annual')} />
      </Card>
      <Card style={styles.disclosure}>
        <Text style={styles.disclosureTitle}>{t('premium.disclosureTitle')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureRenews')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureCancelLocation')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureUninstall')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureAfterCancel')}</Text>
        <Text style={styles.disclosureText}>{t('premium.disclosureRefunds')}</Text>
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
  legalDivider: { color: palette.muted, fontSize: 13 },
});
