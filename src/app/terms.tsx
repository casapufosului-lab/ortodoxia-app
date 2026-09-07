import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { useLocalization } from '@/providers/localization-provider';

export default function TermsScreen() {
  const { t } = useLocalization();
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>{t('terms.title')}</Text>
        <Text style={styles.meta}>{t('terms.meta')}</Text>

        <Text style={styles.h2}>{t('terms.s1Title')}</Text>
        <Text style={styles.p}>{t('terms.s1Entity')}</Text>
        <Text style={styles.p}>{t('terms.s1Support')}</Text>
        <Text style={styles.p}>{t('terms.s1Content')}</Text>

        <Text style={styles.h2}>{t('terms.s2Title')}</Text>
        <Text style={styles.p}>{t('terms.s2Content')}</Text>

        <Text style={styles.h2}>{t('terms.s3Title')}</Text>
        <Text style={styles.p}>{t('terms.s3Content1')}</Text>
        <Text style={styles.p}>{t('terms.s3Content2')}</Text>

        <Text style={styles.h2}>{t('terms.s4Title')}</Text>
        <Text style={styles.p}>{t('terms.s4Content')}</Text>

        <Text style={styles.h2}>{t('terms.s5Title')}</Text>
        <Text style={styles.p}>{t('terms.s5Intro')}</Text>
        <Text style={styles.li}>{t('terms.s5Li1')}</Text>
        <Text style={styles.li}>{t('terms.s5Li2')}</Text>
        <Text style={styles.li}>{t('terms.s5Li3')}</Text>
        <Text style={styles.li}>{t('terms.s5Li4')}</Text>
        <Text style={styles.li}>{t('terms.s5Li5')}</Text>

        <Text style={styles.h2}>{t('terms.s6Title')}</Text>
        <Text style={styles.p}>{t('terms.s6Intro')}</Text>
        <Text style={styles.li}>{t('terms.s6Li1')}</Text>
        <Text style={styles.li}>{t('terms.s6Li2')}</Text>
        <Text style={styles.li}>{t('terms.s6Li3')}</Text>

        <Text style={styles.h3}>{t('terms.s6_1Title')}</Text>
        <Text style={styles.p}>{t('terms.s6_1Intro')}</Text>
        <Text style={styles.li}>{t('terms.s6_1Li1')}</Text>
        <Text style={styles.li}>{t('terms.s6_1Li2')}</Text>
        <Text style={styles.li}>{t('terms.s6_1Li3')}</Text>
        <Text style={styles.li}>{t('terms.s6_1Li4')}</Text>
        <Text style={styles.p}>{t('terms.s6_1Content')}</Text>

        <Text style={styles.h3}>{t('terms.s6_2Title')}</Text>
        <Text style={styles.p}>{t('terms.s6_2Content1')}</Text>
        <Text style={styles.p}>{t('terms.s6_2Content2')}</Text>

        <Text style={styles.h3}>{t('terms.s6_3Title')}</Text>
        <Text style={styles.p}>{t('terms.s6_3Content')}</Text>

        <Text style={styles.h2}>{t('terms.s7Title')}</Text>
        <Text style={styles.p}>{t('terms.s7Content')}</Text>

        <Text style={styles.h2}>{t('terms.s8Title')}</Text>
        <Text style={styles.p}>{t('terms.s8Content')}</Text>
        <Text style={styles.h3}>{t('terms.s8_1Title')}</Text>
        <Text style={styles.p}>{t('terms.s8_1Content')}</Text>
        <Text style={styles.h3}>{t('terms.s8_2Title')}</Text>
        <Text style={styles.p}>{t('terms.s8_2Content')}</Text>
        <Text style={styles.h3}>{t('terms.s8_3Title')}</Text>
        <Text style={styles.p}>{t('terms.s8_3Content')}</Text>
        <Text style={styles.h3}>{t('terms.s8_4Title')}</Text>
        <Text style={styles.p}>{t('terms.s8_4Content')}</Text>
        <Text style={styles.h3}>{t('terms.s8_5Title')}</Text>
        <Text style={styles.p}>{t('terms.s8_5Content')}</Text>

        <Text style={styles.h2}>{t('terms.s9Title')}</Text>
        <Text style={styles.p}>{t('terms.s9Content')}</Text>

        <Text style={styles.h2}>{t('terms.s10Title')}</Text>
        <Text style={styles.p}>{t('terms.s10Content')}</Text>

        <Text style={styles.h2}>{t('terms.s11Title')}</Text>
        <Text style={styles.p}>{t('terms.s11Content')}</Text>

        <Text style={styles.h2}>{t('terms.s12Title')}</Text>
        <Text style={styles.p}>{t('terms.s12Content')}</Text>

        <Text style={styles.h2}>{t('terms.s13Title')}</Text>
        <Text style={styles.p}>{t('terms.s13Support')}</Text>
        <Text style={styles.p}>{t('terms.s13PublicUrl')}</Text>
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
  li: { color: palette.muted, fontSize: 14, lineHeight: 21 },
});
