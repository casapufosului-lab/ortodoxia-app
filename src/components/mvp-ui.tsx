import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { palette } from '@/constants/palette';

export function Screen({ children }: PropsWithChildren) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.screen}>{children}</ScrollView>
    </SafeAreaView>
  );
}

export function PageHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      {eyebrow ? <Text style={styles.eyrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({ children, action }: PropsWithChildren<{ action?: ReactNode }>) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action}
    </View>
  );
}

export function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: palette.background },
  screen: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 36, gap: 18 },
  header: { gap: 6, paddingTop: 8 },
  eyrow: { color: palette.goldDark, fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: palette.ink, fontSize: 30, lineHeight: 36, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 15, lineHeight: 22 },
  card: { backgroundColor: palette.paper, borderColor: palette.line, borderWidth: 1, borderRadius: 18, padding: 18, gap: 10 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: palette.ink, fontSize: 19, fontWeight: '800' },
  primaryButton: { backgroundColor: palette.blue, minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  secondaryButton: { backgroundColor: palette.blueSoft, minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  secondaryButtonText: { color: palette.blue, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
