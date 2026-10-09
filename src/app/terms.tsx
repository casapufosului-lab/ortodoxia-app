import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';
import { useLegalFill } from '@/lib/legal-fields';
import { screenBottomPadding } from '@/lib/responsive-layout';
import { useLocalization } from '@/providers/localization-provider';

export default function TermsScreen() {
  const { t } = useLocalization();
  // Legal values are configuration; placeholders render a localized notice until set.
  const fillLegal = useLegalFill();
  // Ecran fără bară de tab-uri: ultimul paragraf trebuie să rămână deasupra barei de
  // navigare a sistemului, deci padding-ul de jos include zona sigură (nu 60 fix).
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: screenBottomPadding(insets.bottom, 60) }]}>
        <Text style={styles.h1}>{fillLegal(t('terms.title'))}</Text>
        <Text style={styles.meta}>{fillLegal(t('terms.meta'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s1Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s1Entity'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s1Support'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s1Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s2Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s2Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s3Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s3Content1'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s3Content2'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s4Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s4Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s5Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s5Intro'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s5Li1'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s5Li2'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s5Li3'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s5Li4'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s5Li5'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s6Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s6Intro'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s6Li1'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s6Li2'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s6Li3'))}</Text>

        <Text style={styles.h3}>{fillLegal(t('terms.s6_1Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s6_1Intro'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s6_1Li1'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s6_1Li2'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s6_1Li3'))}</Text>
        <Text style={styles.li}>{fillLegal(t('terms.s6_1Li4'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s6_1Content'))}</Text>

        <Text style={styles.h3}>{fillLegal(t('terms.s6_2Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s6_2Content1'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s6_2Content2'))}</Text>

        <Text style={styles.h3}>{fillLegal(t('terms.s6_3Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s6_3Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s7Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s7Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s8Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s8Content'))}</Text>
        <Text style={styles.h3}>{fillLegal(t('terms.s8_1Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s8_1Content'))}</Text>
        <Text style={styles.h3}>{fillLegal(t('terms.s8_2Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s8_2Content'))}</Text>
        <Text style={styles.h3}>{fillLegal(t('terms.s8_3Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s8_3Content'))}</Text>
        <Text style={styles.h3}>{fillLegal(t('terms.s8_4Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s8_4Content'))}</Text>
        <Text style={styles.h3}>{fillLegal(t('terms.s8_5Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s8_5Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s9Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s9Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s10Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s10Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s11Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s11Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s12Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s12Content'))}</Text>

        <Text style={styles.h2}>{fillLegal(t('terms.s13Title'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s13Support'))}</Text>
        <Text style={styles.p}>{fillLegal(t('terms.s13PublicUrl'))}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  content: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, gap: 4 },
  h1: { color: palette.ink, fontSize: 28, fontWeight: '800', paddingTop: 12, paddingBottom: 4 },
  meta: { color: palette.muted, fontSize: 13, marginBottom: 16 },
  h2: { color: palette.ink, fontSize: 18, fontWeight: '800', marginTop: 18, marginBottom: 6 },
  h3: { color: palette.ink, fontSize: 15, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  p: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  li: { color: palette.muted, fontSize: 14, lineHeight: 21 },
});
