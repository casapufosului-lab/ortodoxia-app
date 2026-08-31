import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import { Card, PageHeader, PrimaryButton, Screen, SecondaryButton } from '@/components/mvp-ui';
import { palette } from '@/constants/palette';
import { useSubscription } from '@/hooks/use-subscription';
import { useAuth } from '@/providers/auth-provider';

const benefits = ['50 de mesaje AI pe zi, în loc de 5', 'Conținutul de bază rămâne gratuit pentru toți', 'Poți opri reînnoirea din magazinul telefonului'];

export default function PremiumScreen() {
  const { user } = useAuth();
  const { dailyAiLimit, error, isLoading, isPremium, planLabel, subscription } = useSubscription();
  const [purchaseMessage, setPurchaseMessage] = useState('');

  const showStoreStatus = () => {
    if (!user) {
      router.push('/auth?returnTo=/premium');
      return;
    }

    setPurchaseMessage('Plata Apple și Google se va deschide după conectarea magazinului oficial. Momentan pregătim integrarea abonamentului.');
  };

  return (
    <Screen>
      <PageHeader eyebrow="Abonament" title="Ortodoxia Premium" subtitle="Mai multe întrebări AI, cu o limită clară pentru controlul costurilor." />
      <Card style={styles.statusCard}>
        <Text style={styles.statusLabel}>Planul tău</Text>
        <Text style={styles.statusValue}>{isLoading ? 'Se verifică…' : planLabel}</Text>
        <Text style={styles.statusBody}>{isPremium ? `${dailyAiLimit} de mesaje AI disponibile în fiecare zi.` : '5 mesaje AI pe zi. Rugăciunile, calendarul și conținutul zilnic rămân gratuite.'}</Text>
        {subscription?.current_period_end && isPremium ? <Text style={styles.expiry}>Valabil până la {new Date(subscription.current_period_end).toLocaleDateString('ro-RO')}.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {purchaseMessage ? <Text accessibilityLiveRegion="polite" style={styles.purchaseMessage}>{purchaseMessage}</Text> : null}
      </Card>
      <Card style={styles.hero}>
        <Text style={styles.cross}>☦</Text>
        {benefits.map((benefit) => <View key={benefit} style={styles.benefitRow}><Text style={styles.check}>✓</Text><Text style={styles.benefit}>{benefit}</Text></View>)}
      </Card>
      <Card>
        <Text style={styles.plan}>Lunar</Text>
        <Text style={styles.introPrice}>9,99 lei/lună</Text>
        <Text style={styles.price}>Apoi 24,99 lei/lună. Abonamentul se reînnoiește automat până îl oprești.</Text>
        <PrimaryButton label={user ? 'Activează planul lunar' : 'Autentifică-te pentru Premium'} onPress={showStoreStatus} />
      </Card>
      <Card>
        <Text style={styles.plan}>Anual</Text>
        <Text style={styles.price}>Prețul anual se afișează în magazinul aplicației</Text>
        <PrimaryButton label={user ? 'Activează planul anual' : 'Autentifică-te pentru Premium'} onPress={showStoreStatus} />
      </Card>
      <SecondaryButton label="Restaurează cumpărăturile" onPress={showStoreStatus} />
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
  purchaseMessage: { color: palette.blue, fontSize: 14, fontWeight: '700', lineHeight: 20, textAlign: 'center' },
  cross: { color: palette.gold, fontSize: 34, textAlign: 'center', marginBottom: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: { color: palette.gold, fontSize: 18, fontWeight: '800' },
  benefit: { color: '#FFFFFF', fontSize: 15, flex: 1 },
  plan: { color: palette.ink, fontSize: 20, fontWeight: '800' },
  introPrice: { color: palette.goldDark, fontSize: 20, fontWeight: '800' },
  price: { color: palette.muted, fontSize: 14 },
  note: { color: palette.muted, fontSize: 12, textAlign: 'center' },
});
