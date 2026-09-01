import { router } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { Card, PageHeader, PrimaryButton, Screen, SecondaryButton } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { useRevenueCat } from '@/hooks/use-revenuecat';
import { useSubscription } from '@/hooks/use-subscription';
import { useAuth } from '@/providers/auth-provider';

const benefits = ['50 de mesaje AI pe zi, în loc de 5', 'Conținutul de bază rămâne gratuit pentru toți', 'Poți opri reînnoirea din magazinul telefonului'];

export default function PremiumScreen() {
  const { user } = useAuth();
  const { dailyAiLimit, isLoading, isPremium, planLabel, subscription } = useSubscription();
  const { buy, loading, offeringsError, priceFor, restore } = useRevenueCat();
  const [purchaseResult, setPurchaseResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busyPlan, setBusyPlan] = useState<'monthly' | 'annual' | 'restore' | null>(null);

  const monthlyPrice = priceFor('monthly');
  const annualPrice = priceFor('annual');

  const requireUser = () => {
    if (!user) { router.push('/auth?returnTo=/premium'); return true; }
    return false;
  };

  const purchase = async (plan: 'monthly' | 'annual') => {
    if (requireUser() || busyPlan) return;
    setPurchaseResult(null);
    setBusyPlan(plan);
    const result = await buy(plan);
    setPurchaseResult(result);
    setBusyPlan(null);
  };

  const handleRestore = async () => {
    if (requireUser() || busyPlan) return;
    setPurchaseResult(null);
    setBusyPlan('restore');
    const result = await restore();
    setPurchaseResult(result);
    setBusyPlan(null);
  };

  return (
    <Screen>
      <PageHeader eyebrow="Abonament" title="Ortodoxia Premium" subtitle="Mai multe întrebări AI, cu o limită clară pentru controlul costurilor." />
      <Card style={styles.statusCard}>
        <Text style={styles.statusLabel}>Planul tău</Text>
        <Text style={styles.statusValue}>{isLoading ? 'Se verifică…' : planLabel}</Text>
        <Text style={styles.statusBody}>{isPremium ? `${dailyAiLimit} de mesaje AI disponibile în fiecare zi.` : '5 mesaje AI pe zi. Rugăciunile, calendarul și conținutul zilnic rămân gratuite.'}</Text>
        {subscription?.current_period_end && isPremium ? <Text style={styles.expiry}>Valabil până la {new Date(subscription.current_period_end).toLocaleDateString('ro-RO')}.</Text> : null}
        {offeringsError ? <Text style={styles.error}>{offeringsError}</Text> : null}
        {purchaseResult ? <Text accessibilityLiveRegion="polite" style={purchaseResult.ok ? styles.successMessage : styles.errorMessage}>{purchaseResult.message}</Text> : null}
      </Card>
      <Card style={styles.hero}>
        <Text style={styles.cross}>☦</Text>
        {benefits.map((benefit) => <View key={benefit} style={styles.benefitRow}><Text style={styles.check}>✓</Text><Text style={styles.benefit}>{benefit}</Text></View>)}
      </Card>
      <Card>
        <Text style={styles.plan}>Lunar</Text>
        <Text style={styles.introPrice}>{monthlyPrice ?? 'Preț în magazin'}</Text>
        <Text style={styles.price}>Abonamentul se reînnoiește automat până îl oprești din magazin.</Text>
        <PrimaryButton label={user ? (busyPlan === 'monthly' ? 'Se procesează…' : 'Activează planul lunar') : 'Autentifică-te pentru Premium'} onPress={() => void purchase('monthly')} />
      </Card>
      <Card>
        <Text style={styles.plan}>Anual</Text>
        <Text style={styles.introPrice}>{annualPrice ?? 'Preț în magazin'}</Text>
        <Text style={styles.price}>Abonamentul se reînnoiește automat până îl oprești din magazin.</Text>
        <PrimaryButton label={user ? (busyPlan === 'annual' ? 'Se procesează…' : 'Activează planul anual') : 'Autentifică-te pentru Premium'} onPress={() => void purchase('annual')} />
      </Card>
      <SecondaryButton label={busyPlan === 'restore' ? 'Se restaurează…' : 'Restaurează cumpărăturile'} onPress={() => void handleRestore()} />
      {loading ? <View style={styles.loadingRow}><ActivityIndicator color={palette.blue} size="small" /><Text style={styles.loadingText}>Se procesează plata…</Text></View> : null}
      <Text style={styles.note}>Plățile se procesează securizat prin App Store sau Google Play.</Text>
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
});
