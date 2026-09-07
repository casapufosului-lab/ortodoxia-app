import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { useLocalization } from '@/providers/localization-provider';

export default function PrivacyScreen() {
  const { t } = useLocalization();
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>{t('privacy.title')}</Text>
        <Text style={styles.meta}>{t('privacy.meta')}</Text>

        <Text style={styles.h2}>{t('privacy.s1Title')}</Text>
        <Text style={styles.p}>{t('privacy.s1Entity')}</Text>
        <Text style={styles.p}>{t('privacy.s1Support')}</Text>
        <Text style={styles.p}>{t('privacy.s1Postal')}</Text>

        <Text style={styles.h2}>{t('privacy.s2Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2Intro')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_1Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_1Content')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_2Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_2Content')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_3Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_3Content')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_4Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_4Content1')}</Text>
        <Text style={styles.p}>{t('privacy.s2_4Content2')}</Text>
        <Text style={styles.p}>{t('privacy.s2_4Content3')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_5Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_5Content')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_6Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_6Content')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_7Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_7Content')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_8Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_8Content')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_9Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_9Content')}</Text>

        <Text style={styles.h3}>{t('privacy.s2_10Title')}</Text>
        <Text style={styles.p}>{t('privacy.s2_10Content')}</Text>

        <Text style={styles.h2}>{t('privacy.s3Title')}</Text>
        <Text style={styles.p}>{t('privacy.s3Content')}</Text>

        <Text style={styles.h2}>{t('privacy.s4Title')}</Text>
        <Text style={styles.p}>{t('privacy.s4Intro')}</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.th}>{t('privacy.s4ThService')}</Text>
            <Text style={styles.th}>{t('privacy.s4ThPurpose')}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>Supabase</Text>
            <Text style={styles.td}>{t('privacy.s4RowSupabasePurpose')}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>OpenAI</Text>
            <Text style={styles.td}>{t('privacy.s4RowOpenAIPurpose')}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>RevenueCat</Text>
            <Text style={styles.td}>{t('privacy.s4RowRevenueCatPurpose')}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>Apple App Store / Google Play</Text>
            <Text style={styles.td}>{t('privacy.s4RowAppStorePurpose')}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>YouTube Data API</Text>
            <Text style={styles.td}>{t('privacy.s4RowYouTubePurpose')}</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={styles.td}>Expo / React Native</Text>
            <Text style={styles.td}>{t('privacy.s4RowExpoPurpose')}</Text>
          </View>
        </View>

        <Text style={styles.h2}>{t('privacy.s5Title')}</Text>
        <Text style={styles.p}>{t('privacy.s5Content')}</Text>

        <Text style={styles.h2}>{t('privacy.s6Title')}</Text>
        <Text style={styles.p}>{t('privacy.s6Content')}</Text>

        <Text style={styles.h2}>{t('privacy.s7Title')}</Text>
        <Text style={styles.p}>{t('privacy.s7Content')}</Text>

        <Text style={styles.h2}>{t('privacy.s8Title')}</Text>
        <Text style={styles.p}><Text style={styles.bold}>{t('privacy.s8DeleteLabel')}</Text>{t('privacy.s8DeleteBody')}</Text>
        <Text style={styles.p}><Text style={styles.bold}>{t('privacy.s8CancelLabel')}</Text>{t('privacy.s8CancelBody')}</Text>
        <Text style={styles.p}>{t('privacy.s8Uninstall')}</Text>

        <Text style={styles.h2}>{t('privacy.s9Title')}</Text>
        <Text style={styles.p}>{t('privacy.s9Content')}</Text>

        <Text style={styles.h2}>{t('privacy.s10Title')}</Text>
        <Text style={styles.p}>{t('privacy.s10Support')}</Text>
        <Text style={styles.p}>{t('privacy.s10PublicUrl')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 60, gap: 4 },
  h1: { color: palette.ink, fontSize: 28, fontWeight: '800', paddingTop: 12, paddingBottom: 4 },
  meta: { color: palette.muted, fontSize: 13, marginBottom: 16 },
  h2: { color: palette.ink, fontSize: 18, fontWeight: '800', marginTop: 18, marginBottom: 6 },
  h3: { color: palette.ink, fontSize: 15, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  p: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  bold: { fontWeight: '700', color: palette.ink },
  table: { marginTop: 8, gap: 1 },
  tableHeader: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.line },
  tableRow: { flexDirection: 'row', gap: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.line },
  th: { flex: 1, color: palette.ink, fontSize: 13, fontWeight: '700' },
  td: { flex: 1, color: palette.muted, fontSize: 13, lineHeight: 19 },
});

